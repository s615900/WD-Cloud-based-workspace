// 開放預約端點：只回傳「還沒被預約」且日期在今天以後的空檔，依日期分組，
// 每個時段都帶 id，讓前端可以指定預約哪一筆。
import { getBookableFreeSlots } from "@/server/bot/ragic";
import { formatDayLabel } from "@/server/modules/dayLabel";
import { json } from "@/server/http";

export async function GET() {
  try {
    const groups = await getBookableFreeSlots();
    return json(groups.map((g) => ({ ...g, dayLabel: formatDayLabel(g.date) })));
  } catch (err) {
    console.error("取得可預約空檔失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
