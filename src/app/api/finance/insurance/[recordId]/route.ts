import { json, readBody } from "@/server/http";
import { updatePolicy, type PolicyBody } from "@/server/finance/entities";
import { badRecordId, handleWrite } from "@/server/finance/route";
import { deletePolicy } from "@/server/finance/remove";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/insurance/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改保單", async () => {
    await updatePolicy(recordId, await readBody<PolicyBody>(req));
    return json({ success: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/finance/insurance/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("刪除保單", async () => {
    await deletePolicy(recordId);
    return json({ success: true });
  });
}
