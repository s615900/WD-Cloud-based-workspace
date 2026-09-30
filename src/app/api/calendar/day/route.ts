import type { NextRequest } from "next/server";
import { getCalendarDay } from "@/server/bot/ragic";
import { DATE_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return json({ error: "date 格式須為 yyyy-MM-dd" }, 400);
  }

  try {
    return json(await getCalendarDay(date));
  } catch (err) {
    console.error("取得單日行事曆失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
