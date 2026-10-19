import { json, readBody } from "@/server/http";
import { updateLoan, type LoanBody } from "@/server/finance/entities";
import { badRecordId, handle } from "@/server/finance/route";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/loans/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改貸款", async () => {
    await updateLoan(recordId, await readBody<LoanBody>(req));
    return json({ success: true });
  });
}
