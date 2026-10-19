import { json, readBody } from "@/server/http";
import { badRecordId, handleWrite } from "@/server/finance/route";
import { deleteAccount } from "@/server/finance/remove";
import { updateAccount, type AccountBody } from "@/server/finance/service";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/accounts/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改帳戶", async () => {
    await updateAccount(recordId, await readBody<AccountBody>(req));
    return json({ success: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/finance/accounts/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("刪除帳戶", async () => {
    await deleteAccount(recordId);
    return json({ success: true });
  });
}
