import { json, readBody } from "@/server/http";
import { updateRule, type RuleBody } from "@/server/finance/entities";
import { badRecordId, handle } from "@/server/finance/route";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/rules/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改定期規則", async () => {
    await updateRule(recordId, await readBody<RuleBody>(req));
    return json({ success: true });
  });
}
