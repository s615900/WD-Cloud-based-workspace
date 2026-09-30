// 分享端點：純唯讀，刻意不做任何登入驗證，只回傳空檔時段（不含行程／待辦的實際內容），
// 給 /share 分享頁使用。
//
// 不帶 dates 參數：回傳「今天以後」所有已標註空檔的完整清單，依日期由近到遠排序，
// 連結本身不用綁特定日期，同一個連結打開永遠是最新資料。
// 帶 dates 參數：只查指定的那幾天（保留給舊連結相容用）。
import type { NextRequest } from "next/server";
import { getAllFutureFreeSlots, getFreeSlotsForDates } from "@/server/bot/ragic";
import { formatDayLabel } from "@/server/modules/dayLabel";
import { DATE_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

const MAX_SHARE_DATES = 31;

export async function GET(req: NextRequest) {
  const datesParam = req.nextUrl.searchParams.get("dates");
  if (!datesParam || !datesParam.trim()) {
    try {
      const groups = await getAllFutureFreeSlots();
      return json(groups.map((g) => ({ ...g, dayLabel: formatDayLabel(g.date) })));
    } catch (err) {
      console.error("取得分享空檔失敗:", err);
      return json({ error: "internal error" }, 500);
    }
  }

  const dates = datesParam
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  if (dates.length === 0 || dates.length > MAX_SHARE_DATES || !dates.every((d) => DATE_RE.test(d))) {
    return json({ error: `dates 須為 1~${MAX_SHARE_DATES} 個逗號分隔的 yyyy-MM-dd 日期` }, 400);
  }

  try {
    const slotsByDate = await getFreeSlotsForDates(dates);
    return json(
      dates.map((date) => ({
        date,
        dayLabel: formatDayLabel(date),
        slots: (slotsByDate.get(date) ?? []).map((s) => ({ start: s.start, end: s.end })),
      })),
    );
  } catch (err) {
    console.error("取得分享空檔失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
