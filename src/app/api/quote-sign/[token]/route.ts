// 報價單客戶簽署頁的公開 API：不需登入（客戶沒有帳號），改用簽章過的 token 當存取憑證。
// 掛在 /api/quote-sign（不是 /api/quotes/...），才不會被 proxy.ts 的登入保護擋到。
import { after } from "next/server";
import {
  ragicGetOne,
  ragicUpdate,
  unwrapSubtableRows,
  uploadQuoteSignature,
  toQuoteDateTime,
  QUOTE_FIELD,
  QUOTE_READ_FIELD,
  QUOTE_ITEM_SUBTABLE_READ_KEY,
  QUOTE_ITEM_READ_FIELD,
  SHEET,
  type RagicRecordData,
} from "@/server/lib/quotationRagic";
import { verifyQuoteToken } from "@/server/lib/quoteSignToken";
import { str } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/quote-sign/[token]">;

// token 無效／過期一律回同一種錯誤，不區分「格式錯」跟「簽章不符」，避免洩漏偽造線索。
export async function GET(_req: Request, ctx: Ctx) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const quoteId = verifyQuoteToken((await ctx.params).token);
  if (!quoteId) return json({ error: "連結無效或已失效" }, 404);

  try {
    const record = await ragicGetOne(SHEET.quotes, quoteId);
    if (!record || Object.keys(record).length === 0) {
      return json({ error: "找不到這筆報價單" }, 404);
    }

    const rows = unwrapSubtableRows(record[QUOTE_ITEM_SUBTABLE_READ_KEY]);
    const items = rows.map((row: RagicRecordData) => ({
      name: str(row[QUOTE_ITEM_READ_FIELD.商品名稱]),
      price: str(row[QUOTE_ITEM_READ_FIELD.單價]),
      unit: str(row[QUOTE_ITEM_READ_FIELD.單位]),
      qty: str(row[QUOTE_ITEM_READ_FIELD.數量]),
      note: str(row[QUOTE_ITEM_READ_FIELD.備註]),
    }));

    const signedAt = str(record[QUOTE_READ_FIELD.簽署時間]);

    // 第一次開啟才記錄已讀時間（代表「客戶第一次看到」）。best-effort：回應送出後才寫，
    // 寫入失敗不影響這次瀏覽。
    if (!str(record[QUOTE_READ_FIELD.已讀時間])) {
      const readAt = toQuoteDateTime(new Date());
      after(async () => {
        try {
          await ragicUpdate(SHEET.quotes, quoteId, { [QUOTE_FIELD.已讀時間]: readAt });
        } catch (err) {
          console.error("記錄報價單已讀時間失敗:", err);
        }
      });
    }

    return json({
      quoteNumber: str(record[QUOTE_READ_FIELD.報價單編號]),
      projectName: str(record[QUOTE_READ_FIELD.專案名稱]),
      clientName: str(record[QUOTE_READ_FIELD.客戶名稱]),
      taxId: str(record[QUOTE_READ_FIELD.統一編號]),
      contact: str(record[QUOTE_READ_FIELD.聯絡人]),
      quoteDate: str(record[QUOTE_READ_FIELD.報價日期]),
      validUntil: str(record[QUOTE_READ_FIELD.報價有效期限]),
      taxMode: str(record[QUOTE_READ_FIELD.計稅方式]),
      untaxedAmount: str(record[QUOTE_READ_FIELD.未稅金額]),
      taxAmount: str(record[QUOTE_READ_FIELD.稅額]),
      totalAmount: str(record[QUOTE_READ_FIELD.總金額含稅]),
      note: str(record[QUOTE_READ_FIELD.特別說明]),
      contractTerms: str(record[QUOTE_READ_FIELD.合約條款內容]),
      items,
      signed: signedAt !== "",
      signerName: str(record[QUOTE_READ_FIELD.簽署人]),
      signedAt,
    });
  } catch (err) {
    console.error("取得客戶報價單檢視失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const quoteId = verifyQuoteToken((await ctx.params).token);
  if (!quoteId) return json({ success: false, error: "連結無效或已失效" }, 404);

  const body = await readBody<{ signerName?: unknown; signatureImage?: unknown }>(req);
  const signerName = typeof body.signerName === "string" ? body.signerName.trim() : "";
  const signatureImage = typeof body.signatureImage === "string" ? body.signatureImage : "";

  if (!signerName) return json({ success: false, error: "請填寫簽署人姓名" }, 400);
  const match = signatureImage.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!match) return json({ success: false, error: "簽名檔格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.quotes, quoteId);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆報價單" }, 404);
    }
    if (str(record[QUOTE_READ_FIELD.簽署時間])) {
      return json({ success: false, error: "這筆報價單已經完成簽署" }, 409);
    }

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    const extension = mimeType === "image/png" ? "png" : "jpg";
    await uploadQuoteSignature(quoteId, buffer, `signature-${quoteId}.${extension}`, mimeType);

    await ragicUpdate(SHEET.quotes, quoteId, {
      [QUOTE_FIELD.簽署人]: signerName,
      [QUOTE_FIELD.簽署時間]: toQuoteDateTime(new Date()),
    });

    return json({ success: true });
  } catch (err) {
    console.error("送出報價單簽署失敗:", err);
    return json({ success: false, error: errorMessage(err, "送出失敗") }, 500);
  }
}
