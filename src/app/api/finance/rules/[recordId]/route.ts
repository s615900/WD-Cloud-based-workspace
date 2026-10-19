import { json, readBody } from "@/server/http";
import { updateRule, type RuleBody } from "@/server/finance/entities";
import { badRecordId, handleWrite } from "@/server/finance/route";
import { deleteRule } from "@/server/finance/remove";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/rules/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改定期規則", async () => {
    await updateRule(recordId, await readBody<RuleBody>(req));
    return json({ success: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/finance/rules/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("刪除規則", async () => {
    await deleteRule(recordId);
    return json({ success: true });
  });
}
