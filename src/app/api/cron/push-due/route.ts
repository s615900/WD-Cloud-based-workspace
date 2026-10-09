// 到期提醒推播（給外部排程服務每 15 分鐘打一次，例如 cron-job.org，做法同 daily-reminder）。
// 用 ?key= 帶 CRON_SECRET 驗證。
//
// 提醒兩種資料：
//  1. 個人行程（行事曆，有日期＋開始時間）：開始前 30 分鐘提醒
//  2. 待辦的「到期日」（只有日期）：到期當天早上 09:00 提醒（狀態還是「準備中」才提醒）
//
// 不在 Ragic 另外記「已提醒」：只提醒「時間點剛好落在這次檢查區間內」的項目。
// 區間長度 windowMin 必須等於排程的執行間隔（預設 15 分鐘），否則會漏提醒或重複提醒。
//
// 測試用參數：?dryRun=1 只回傳會提醒什麼、不發送；?now=2026-10-09T08:50 模擬現在時間（台北時間）。
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dueDateConfigured, queryRecordsFromRagic } from "@/server/bot/ragic";
import { listAllSchedule } from "@/server/ragic/schedule";
import { sendPushToAll, type PushPayload } from "@/server/lib/webPush";
import { pushNotConfiguredResponse } from "@/server/lib/pushGuard";
import { errorMessage, json } from "@/server/http";

const SCHEDULE_LEAD_MIN = 30;
const TODO_REMIND_AT_MIN = 9 * 60;

function isValidKey(provided: string | null): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 台北時間的「現在」：日期 yyyy-MM-dd 與當天第幾分鐘
function taipeiNow(override: string | null): { ymd: string; minutes: number } {
  const m = override?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (m) return { ymd: m[1]!, minutes: Number(m[2]) * 60 + Number(m[3]) };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // hour12:false 在午夜有些環境會給 "24"
  const hour = Number(get("hour")) % 24;
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export async function GET(req: NextRequest) {
  if (!isValidKey(req.nextUrl.searchParams.get("key"))) {
    return json({ error: "unauthorized" }, 401);
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  if (!dryRun) {
    const blocked = pushNotConfiguredResponse();
    if (blocked) return blocked;
  }

  const userId = process.env["LINE_USER_ID"];
  if (!userId) return json({ error: "LINE_USER_ID is not set" }, 500);

  const windowMin = Math.min(60, Math.max(5, Number(req.nextUrl.searchParams.get("windowMin")) || 15));
  const now = taipeiNow(req.nextUrl.searchParams.get("now"));
  const nowAbs = dayNumber(now.ymd) * 1440 + now.minutes;

  try {
    const payloads: PushPayload[] = [];

    // 1) 個人行程：開始時間距離現在 (LEAD - window, LEAD] 分鐘
    const schedule = await listAllSchedule();
    for (const e of schedule) {
      if (e.userId !== userId || e.kind !== "個人行程" || e.status !== "正常" || e.allDay) continue;
      const [h, m] = e.start.split(":").map(Number);
      if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) continue;
      const untilStart = dayNumber(e.date) * 1440 + h * 60 + m - nowAbs;
      if (untilStart > SCHEDULE_LEAD_MIN - windowMin && untilStart <= SCHEDULE_LEAD_MIN) {
        payloads.push({
          title: `${e.start} 即將開始`,
          body: e.title + (e.location ? `（${e.location}）` : ""),
          url: `/desktop/tasks?id=${e.id}&src=schedule`,
          tag: `schedule-${e.id}-${e.date}`,
        });
      }
    }

    // 2) 待辦到期日：到期當天、現在落在 09:00 起算的一個區間內，且還沒完成
    let todoCount = 0;
    if (dueDateConfigured() && now.minutes >= TODO_REMIND_AT_MIN && now.minutes < TODO_REMIND_AT_MIN + windowMin) {
      const memos = await queryRecordsFromRagic(userId, "備忘");
      for (const r of memos) {
        if (r["狀態"] !== "準備中") continue;
        if (r["到期日"]?.trim().replaceAll("/", "-") !== now.ymd) continue;
        todoCount++;
        payloads.push({
          title: "待辦今天到期",
          body: r["內容文字"],
          url: `/desktop/tasks?id=${r["_ragicId"]}&src=todo`,
          tag: `todo-${r["_ragicId"]}-${now.ymd}`,
        });
      }
    }

    if (dryRun) {
      return json({ dryRun: true, now, windowMin, scheduleCount: payloads.length - todoCount, todoCount, payloads });
    }

    let sent = 0;
    let failed = 0;
    for (const p of payloads) {
      const r = await sendPushToAll(p);
      sent += r.sent;
      failed += r.failed;
    }
    return json({ pushed: true, reminders: payloads.length, sent, failed });
  } catch (err) {
    console.error("到期提醒推播失敗:", err);
    return json({ error: errorMessage(err, "internal error") }, 500);
  }
}
