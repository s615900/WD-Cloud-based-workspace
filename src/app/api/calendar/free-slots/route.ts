// 整月空檔總覽：一次回傳這個月所有已標註空檔的日期與時段（依日期排序）
import type { NextRequest } from "next/server";
import { getFreeSlotsForMonth } from "@/server/bot/ragic";
import { MONTH_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !MONTH_RE.test(month)) {
    return json({ error: "month 格式須為 yyyy-MM" }, 400);
  }

  try {
    return json(await getFreeSlotsForMonth(month));
  } catch (err) {
    console.error("取得整月空檔總覽失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
