// 倒數日清單：行事曆行程裡標了「倒數日」的，算出下一次日期與剩餘天數，近的排前面
import { listAllSchedule } from "@/server/ragic/schedule";
import { nextOccurrence } from "@/lib/countdown";
import { todayYMD } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET() {
  try {
    const today = todayYMD();
    const items = (await listAllSchedule())
      .filter((e) => e.countdown && e.status !== "取消")
      .flatMap((e) => {
        const next = nextOccurrence(e.date, e.yearly, today);
        return next ? [{ id: e.id, title: e.title, originalDate: e.date, yearly: e.yearly, date: next.date, daysLeft: next.daysLeft }] : [];
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return json(items);
  } catch (err) {
    console.error("取得倒數日失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
