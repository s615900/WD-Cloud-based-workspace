import { json, readBody } from "@/server/http";
import { badRecordId, handle } from "@/server/finance/route";
import { updateCategory, type CategoryBody } from "@/server/finance/service";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/categories/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改分類", async () => {
    await updateCategory(recordId, await readBody<CategoryBody>(req));
    return json({ success: true });
  });
}
