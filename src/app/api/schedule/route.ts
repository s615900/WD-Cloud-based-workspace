// 桌面版首頁／行事曆用的月份行程列表：重用 queryTasksForApi，只是換一種輸出格式
// （帶完整 yyyy-MM-dd 日期，方便桌面版依月份/近三日篩選）。
import type { NextRequest } from "next/server";
import { queryTasksForApi } from "@/server/bot/ragic";
import { MONTH_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

interface ScheduleItem {
  id: number;
  date: string; // yyyy-MM-dd
  time: string;
  title: string;
  status: string;
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !MONTH_RE.test(month)) {
    return json({ error: "month 格式須為 yyyy-MM" }, 400);
  }

  try {
    const tasks = await queryTasksForApi({ type: "行程" });

    const results: ScheduleItem[] = [];
    for (const task of tasks) {
      if (!task.date) continue;
      // 行程日期只存 MM/DD，年份沿用建立時間的年份（單一使用者的個人記事，同年份成立）。
      const year = task.createdAt.split("/")[0];
      const [mm, dd] = task.date.split("/");
      if (!year || !mm || !dd) continue;
      const isoDate = `${year}-${mm}-${dd}`;
      if (!isoDate.startsWith(month)) continue;
      results.push({ id: task.id, date: isoDate, time: task.time, title: task.content, status: task.status });
    }

    results.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return json(results);
  } catch (err) {
    console.error("取得桌面版行程列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
