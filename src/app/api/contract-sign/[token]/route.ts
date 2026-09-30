// 合約客戶簽署頁的公開 API：跟報價單簽署同一套設計，不需登入，改用簽章過的 token 當存取憑證。
import {
  ragicGetOne,
  ragicUpdate,
  unwrapSubtableRows,
  uploadContractFile,
  toQuoteDateTime,
  CONTRACT_FIELD,
  CONTRACT_READ_FIELD,
  CONTRACT_ITEM_SUBTABLE_READ_KEY,
  CONTRACT_ITEM_READ_FIELD,
  SHEET,
  type RagicRecordData,
} from "@/server/lib/quotationRagic";
import { verifyContractToken } from "@/server/lib/contractSignToken";
import { parseSignatureImage } from "@/server/modules/contracts";
import { derivedStoredStatus } from "@/lib/contractStatus";
import { str } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/contract-sign/[token]">;

export async function GET(_req: Request, ctx: Ctx) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const contractId = verifyContractToken((await ctx.params).token);
  if (!contractId) return json({ error: "連結無效或已失效" }, 404);

  try {
    const record = await ragicGetOne(SHEET.contracts, contractId);
    if (!record || Object.keys(record).length === 0) {
      return json({ error: "找不到這筆合約" }, 404);
    }
    if (str(record[CONTRACT_READ_FIELD.狀態]) === "作廢") {
      return json({ error: "這份合約已作廢，請與業務聯繫" }, 410);
    }

    const rows = unwrapSubtableRows(record[CONTRACT_ITEM_SUBTABLE_READ_KEY]);
    const items = rows.map((row: RagicRecordData) => ({
      name: str(row[CONTRACT_ITEM_READ_FIELD.商品名稱]),
      price: str(row[CONTRACT_ITEM_READ_FIELD.單價]),
      unit: str(row[CONTRACT_ITEM_READ_FIELD.單位]),
      qty: str(row[CONTRACT_ITEM_READ_FIELD.數量]),
    }));

    const signedAt = str(record[CONTRACT_READ_FIELD.客戶簽署時間]);

    return json({
      contractNumber: str(record[CONTRACT_READ_FIELD.合約編號]),
      quoteNumber: str(record[CONTRACT_READ_FIELD.報價單號]),
      clientName: str(record[CONTRACT_READ_FIELD.客戶名稱]),
      taxId: str(record[CONTRACT_READ_FIELD.統一編號]),
      contact: str(record[CONTRACT_READ_FIELD.聯絡人]),
      quoteDate: str(record[CONTRACT_READ_FIELD.報價日期]),
      validUntil: str(record[CONTRACT_READ_FIELD.有效期限]),
      amount: str(record[CONTRACT_READ_FIELD.合約金額]),
      nda: str(record[CONTRACT_READ_FIELD.保密條款內容NDA]),
      note: str(record[CONTRACT_READ_FIELD.備註]),
      items,
      signed: signedAt !== "",
      signerName: str(record[CONTRACT_READ_FIELD.客戶簽署人]),
      signedAt,
    });
  } catch (err) {
    console.error("取得客戶合約檢視失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const contractId = verifyContractToken((await ctx.params).token);
  if (!contractId) return json({ success: false, error: "連結無效或已失效" }, 404);

  const body = await readBody<{ signerName?: unknown; signatureImage?: unknown }>(req);
  const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
  if (!signerName) return json({ success: false, error: "請填寫簽署人姓名" }, 400);
  const signature = parseSignatureImage(body.signatureImage);
  if (!signature) return json({ success: false, error: "簽名檔格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.contracts, contractId);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆合約" }, 404);
    }
    if (str(record[CONTRACT_READ_FIELD.客戶簽署時間])) {
      return json({ success: false, error: "這筆合約已經完成客戶簽署" }, 409);
    }
    const status = str(record[CONTRACT_READ_FIELD.狀態]);
    if (status === "作廢") {
      return json({ success: false, error: "這份合約已作廢，請與業務聯繫" }, 410);
    }

    await uploadContractFile(
      contractId,
      CONTRACT_FIELD.客戶簽署,
      signature.buffer,
      `customer-signature-${contractId}.${signature.extension}`,
      signature.mimeType,
    );

    const signedAt = toQuoteDateTime(new Date());
    await ragicUpdate(SHEET.contracts, contractId, {
      [CONTRACT_FIELD.客戶簽署人]: signerName,
      [CONTRACT_FIELD.客戶簽署時間]: signedAt,
      [CONTRACT_FIELD.狀態]: derivedStoredStatus({
        status,
        customerSignedAt: signedAt,
        staffSignedAt: str(record[CONTRACT_READ_FIELD.負責人簽署時間]),
      }),
    });

    return json({ success: true });
  } catch (err) {
    console.error("送出合約客戶簽署失敗:", err);
    return json({ success: false, error: errorMessage(err, "送出失敗") }, 500);
  }
}
