// 每日主動推播提醒（給外部排程服務打的端點，例如 cron-job.org）
// 用 ?key= 帶 CRON_SECRET 驗證，避免被其他人亂觸發
import { timingSafeEqual } from "node:crypto";
import { messagingApi } from "@line/bot-sdk";
import type { NextRequest } from "next/server";
import { queryIncompleteRecordsFromRagic, getTodayYMD } from "@/server/bot/ragic";
import { buildDailyReminderFlex } from "@/server/bot/flex";
import { getScheduleForDate, getFreeSlotsForDate } from "@/server/modules/roster";
import { json } from "@/server/http";

function isValidKey(provided: string | null): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // 長度不同就直接判定不符，避免 timingSafeEqual 因長度不一致而丟例外
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isValidKey(req.nextUrl.searchParams.get("key"))) {
    return json({ error: "unauthorized" }, 401);
  }

  const userId = process.env["LINE_USER_ID"];
  if (!userId) {
    return json({ error: "LINE_USER_ID is not set" }, 500);
  }

  try {
    const today = getTodayYMD();
    const [todaySchedule, freeSlots, incompleteRecords] = await Promise.all([
      getScheduleForDate(today),
      getFreeSlotsForDate(today),
      queryIncompleteRecordsFromRagic(userId),
    ]);

    // 空檔設定尚未建立是設定面的問題，不是「今天沒事」，維持錯誤回應，不硬塞空陣列推播。
    if (freeSlots === null) {
      return json({ error: "空檔設定尚未建立" }, 500);
    }

    // 三個區塊都可能是空的，仍然要推播（見 buildDailyReminderFlex 的空狀態文字）。
    const message = buildDailyReminderFlex(todaySchedule, freeSlots, incompleteRecords);

    // ?dryRun=1：只回傳組好的訊息內容供檢查，不真的呼叫 push API
    if (req.nextUrl.searchParams.get("dryRun") === "1") {
      return json({
        pushed: false,
        dryRun: true,
        todayScheduleCount: todaySchedule.length,
        freeSlotCount: freeSlots.length,
        incompleteCount: incompleteRecords.length,
        message,
      });
    }

    const client = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env["LINE_CHANNEL_ACCESS_TOKEN"] ?? "",
    });
    await client.pushMessage({ to: userId, messages: [message] });

    return json({
      pushed: true,
      todayScheduleCount: todaySchedule.length,
      freeSlotCount: freeSlots.length,
      incompleteCount: incompleteRecords.length,
    });
  } catch (err) {
    console.error("每日提醒推播失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}
