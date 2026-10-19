import { json, readBody } from "@/server/http";
import { payStatement, type PayBody } from "@/server/finance/cards";
import { badRecordId, handle } from "@/server/finance/route";

// 手動繳款：產生「銀行 → 信用卡」轉帳（不算支出），並更新帳單已繳金額與狀態
export async function POST(req: Request, ctx: RouteContext<"/api/finance/statements/[recordId]/pay">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("繳款", async () => json({ success: true, ...(await payStatement(recordId, await readBody<PayBody>(req))) }));
}
