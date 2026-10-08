import { hrDelete } from "@/server/lib/hrRagic";
import { isRecordId, notConfiguredResponse } from "@/server/modules/hr";
import { errorMessage, json } from "@/server/http";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/hr/leaves/[id]">) {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  if (!isRecordId(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  try {
    await hrDelete("leaves", id);
    return json({ success: true });
  } catch (err) {
    console.error("刪除請假紀錄失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
