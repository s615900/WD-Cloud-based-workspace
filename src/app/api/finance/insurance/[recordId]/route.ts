import { json, readBody } from "@/server/http";
import { updatePolicy, type PolicyBody } from "@/server/finance/entities";
import { badRecordId, handle } from "@/server/finance/route";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/insurance/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改保單", async () => {
    await updatePolicy(recordId, await readBody<PolicyBody>(req));
    return json({ success: true });
  });
}
