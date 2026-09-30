// 負責人簽署：在桌面版內部直接畫簽名送出（負責人已經是登入的自己人，不需要公開連結）。
import {
  ragicGetOne,
  ragicUpdate,
  uploadContractFile,
  toQuoteDateTime,
  CONTRACT_FIELD,
  CONTRACT_READ_FIELD,
  SHEET,
} from "@/server/lib/quotationRagic";
import { getStaffSignerEmail, parseSignatureImage } from "@/server/modules/contracts";
import { str } from "@/server/modules/dates";
import { derivedStoredStatus } from "@/lib/contractStatus";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/contracts/[id]/staff-signature">) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  const body = await readBody<{ signatureImage?: unknown }>(req);
  const signature = parseSignatureImage(body.signatureImage);
  if (!signature) return json({ success: false, error: "簽名檔格式錯誤" }, 400);

  try {
    const staffEmail = getStaffSignerEmail();
    const record = await ragicGetOne(SHEET.contracts, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆合約" }, 404);
    }
    if (str(record[CONTRACT_READ_FIELD.負責人簽署時間])) {
      return json({ success: false, error: "這筆合約已經完成負責人簽署" }, 409);
    }
    const status = str(record[CONTRACT_READ_FIELD.狀態]);
    if (status === "作廢") {
      return json({ success: false, error: "這筆合約已作廢，無法簽署" }, 409);
    }

    await uploadContractFile(
      id,
      CONTRACT_FIELD.負責人簽署,
      signature.buffer,
      `staff-signature-${id}.${signature.extension}`,
      signature.mimeType,
    );

    const signedAt = toQuoteDateTime(new Date());
    await ragicUpdate(SHEET.contracts, id, {
      [CONTRACT_FIELD.負責人簽署人]: staffEmail,
      [CONTRACT_FIELD.負責人簽署時間]: signedAt,
      [CONTRACT_FIELD.狀態]: derivedStoredStatus({
        status,
        customerSignedAt: str(record[CONTRACT_READ_FIELD.客戶簽署時間]),
        staffSignedAt: signedAt,
      }),
    });

    return json({ success: true });
  } catch (err) {
    console.error("送出負責人簽署失敗:", err);
    return json({ success: false, error: errorMessage(err, "送出失敗") }, 500);
  }
}
