import { json, readBody } from "@/server/http";
import { badRecordId, handleWrite } from "@/server/finance/route";
import { deleteTransaction, updateTransaction, type TransactionBody } from "@/server/finance/service";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/transactions/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改明細", async () => {
    await updateTransaction(recordId, await readBody<TransactionBody>(req));
    return json({ success: true });
  });
}

// 只允許來源為「手動」的明細，其他來源回 403
export async function DELETE(_req: Request, ctx: RouteContext<"/api/finance/transactions/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("刪除明細", async () => {
    await deleteTransaction(recordId);
    return json({ success: true });
  });
}
