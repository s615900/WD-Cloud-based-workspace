import { json, readBody } from "@/server/http";
import { badRecordId, handle } from "@/server/finance/route";
import { updateAccount, type AccountBody } from "@/server/finance/service";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/accounts/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改帳戶", async () => {
    await updateAccount(recordId, await readBody<AccountBody>(req));
    return json({ success: true });
  });
}
