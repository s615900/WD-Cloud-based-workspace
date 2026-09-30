import { deleteScheduleBatch } from "@/server/ragic/schedule";
import { errorMessage, json } from "@/server/http";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/roster/schedule/batch/[batchId]">) {
  const { batchId } = await ctx.params;
  try {
    const deleted = await deleteScheduleBatch(batchId);
    return json({ success: true, deleted });
  } catch (err) {
    console.error("整組刪除排班行程失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
