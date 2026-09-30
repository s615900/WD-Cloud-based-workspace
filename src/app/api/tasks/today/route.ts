import { queryTodayTasksForApi } from "@/server/bot/ragic";
import { json } from "@/server/http";

export async function GET() {
  try {
    return json(await queryTodayTasksForApi());
  } catch (err) {
    console.error("取得今日待辦失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
