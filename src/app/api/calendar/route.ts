// 月曆摘要（每天的類型點點）
import type { NextRequest } from "next/server";
import { getCalendarMonthSummary } from "@/server/bot/ragic";
import { MONTH_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !MONTH_RE.test(month)) {
    return json({ error: "month 格式須為 yyyy-MM" }, 400);
  }

  try {
    return json(await getCalendarMonthSummary(month));
  } catch (err) {
    console.error("取得月曆摘要失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
