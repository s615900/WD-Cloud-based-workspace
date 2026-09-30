// 產生合約客戶簽署頁的公開連結（token 憑證），流程跟報價單的 sign-link 完全對齊。
import { ragicGetOne, ragicUpdate, CONTRACT_FIELD, CONTRACT_READ_FIELD, SHEET } from "@/server/lib/quotationRagic";
import { derivedStoredStatus } from "@/lib/contractStatus";
import { str } from "@/server/modules/dates";
import { signContractToken } from "@/server/lib/contractSignToken";
import { errorMessage, json, lockedResponse } from "@/server/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/contracts/[id]/sign-link">) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.contracts, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ success: false, error: "找不到這筆合約" }, 404);
    }
    const status = str(record[CONTRACT_READ_FIELD.狀態]);
    if (status === "作廢") {
      return json({ success: false, error: "這筆合約已作廢，無法產生簽署連結" }, 409);
    }
    // 送出簽署連結＝已發送給客戶，草稿狀態自動往前推
    const next = derivedStoredStatus(
      {
        status,
        customerSignedAt: str(record[CONTRACT_READ_FIELD.客戶簽署時間]),
        staffSignedAt: str(record[CONTRACT_READ_FIELD.負責人簽署時間]),
      },
      { sent: true },
    );
    if (next !== status) {
      await ragicUpdate(SHEET.contracts, id, { [CONTRACT_FIELD.狀態]: next });
    }
    return json({ success: true, token: signContractToken(id) });
  } catch (err) {
    console.error("產生合約簽署連結失敗:", err);
    return json({ success: false, error: errorMessage(err, "產生連結失敗") }, 500);
  }
}
