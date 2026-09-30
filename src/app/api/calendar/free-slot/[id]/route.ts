import { deleteFreeSlotFromRagic } from "@/server/bot/ragic";
import { errorMessage, json } from "@/server/http";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/calendar/free-slot/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return json({ success: false, error: "id 格式錯誤" }, 400);
  }

  try {
    await deleteFreeSlotFromRagic(id);
    return json({ success: true });
  } catch (err) {
    console.error("刪除空檔失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 404);
  }
}
