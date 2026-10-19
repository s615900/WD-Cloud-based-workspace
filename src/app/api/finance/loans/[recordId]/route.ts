import { json, readBody } from "@/server/http";
import { updateLoan, type LoanBody } from "@/server/finance/entities";
import { badRecordId, handleWrite } from "@/server/finance/route";
import { deleteLoan } from "@/server/finance/remove";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/loans/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改貸款", async () => {
    await updateLoan(recordId, await readBody<LoanBody>(req));
    return json({ success: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/finance/loans/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("刪除貸款", async () => {
    await deleteLoan(recordId);
    return json({ success: true });
  });
}
