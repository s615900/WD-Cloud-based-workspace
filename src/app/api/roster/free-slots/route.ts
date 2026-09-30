// 空檔推算查詢：讀空檔設定＋當日／前一日排班行程，套用 ragic/freeSlots.ts 的純函式演算法。
import type { NextRequest } from "next/server";
import { getFreeSlotsForDate } from "@/server/modules/roster";
import { DATE_RE } from "@/server/modules/dates";
import { json } from "@/server/http";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return json({ error: "date 格式須為 yyyy-MM-dd" }, 400);
  }

  try {
    const slots = await getFreeSlotsForDate(date);
    if (slots === null) {
      return json({ error: "空檔設定尚未建立" }, 500);
    }
    return json({ date, slots });
  } catch (err) {
    console.error("計算空檔失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
