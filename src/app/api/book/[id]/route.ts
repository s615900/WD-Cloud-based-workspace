import { after } from "next/server";
import { bookFreeSlotInRagic, SlotAlreadyBookedError } from "@/server/bot/ragic";
import { buildBookingRequestFlex } from "@/server/bot/flex";
import { pushFlexMessageToOwner } from "@/server/bot/linePush";
import { formatDayLabel } from "@/server/modules/dayLabel";
import { errorMessage, json, readBody } from "@/server/http";

// 同一個 process 內、同一筆空檔 id 的預約請求同時只放行一個，補上「查詢狀態」到
// 「寫回 Ragic」之間那段查詢延遲留下的競態縫隙（Ragic 沒有條件式更新的 API）。
const bookingLocks = new Set<string>();

export async function POST(req: Request, ctx: RouteContext<"/api/book/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return json({ success: false, error: "id 格式錯誤" }, 400);
  }

  const body = await readBody<{ name?: unknown }>(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 20) {
    return json({ success: false, error: "請填寫 1-20 字的姓名" }, 400);
  }

  if (bookingLocks.has(id)) {
    return json({ success: false, error: "這個時段剛被別人預約走了" }, 409);
  }
  bookingLocks.add(id);

  try {
    const booked = await bookFreeSlotInRagic(id, name);

    // 回應送出後再推播待確認 Flex 卡片給你，讓你能直接按「確認預約」／「拒絕」；
    // 推播失敗只記錄 log——這筆預約仍成立為「待確認」。
    after(async () => {
      const flexMessage = buildBookingRequestFlex(name, formatDayLabel(booked.date), booked.start, booked.end, id);
      try {
        await pushFlexMessageToOwner(flexMessage);
      } catch (err) {
        console.error("預約通知推播失敗:", err);
      }
    });

    return json({ success: true });
  } catch (err) {
    if (err instanceof SlotAlreadyBookedError) {
      return json({ success: false, error: err.message }, 409);
    }
    console.error("預約失敗:", err);
    return json({ success: false, error: errorMessage(err, "預約失敗，請稍後再試") }, 500);
  } finally {
    bookingLocks.delete(id);
  }
}
