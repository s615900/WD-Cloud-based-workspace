import { json, readBody } from "@/server/http";
import { createRateChange } from "@/server/finance/entities";
import { badRecordId, handleWrite } from "@/server/finance/route";

// 機動利率調整：新增一筆利率異動，系統自生效日起以剩餘本金重算
export async function POST(req: Request, ctx: RouteContext<"/api/finance/loans/[recordId]/rate-changes">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("新增利率異動", async () => json({ success: true, id: await createRateChange(recordId, await readBody(req)) }));
}
