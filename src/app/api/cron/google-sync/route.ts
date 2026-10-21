// Google「待辦事項」日曆 ⇄ 行程（/ragicforms21/8 個人行程）雙向同步（給外部排程服務每 10 分鐘打一次，
// 例如 cron-job.org，做法同 push-due）。用 ?key= 帶 CRON_SECRET 驗證。
//
// 工作台這邊的新增／修改／刪除會即時推到 Google（見 ragic/schedule.ts）；這支負責反方向，並補漏：
//  1. Google 新增的事件 → 在行程新增一筆（先用日期＋開始時間＋標題比對，已有就只建立連結）
//  2. Google 修改的事件 → 更新行程（工作台修改會即時推到 Google，所以兩邊內容不同時以 Google 為準）
//  3. Google 刪除的事件 → 行程標成「取消」（可恢復，不直接刪資料）
//  4. 行程有、Google 沒有（建立當下 Google 失敗、或欄位建好前的舊行程）→ 補推到 Google
// 只處理「過去 7 天～未來 180 天」的事件；循環事件不匯入（避免一次灌進一大堆）。
//
// 測試用參數：?dryRun=1 只回傳會做什麼、不寫入。
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { calendarConfigured, eventToItem, getGoogleEvent, listGoogleEvents, type CalendarItem } from "@/server/bot/calendar";
import {
  createSchedule,
  gcalFieldConfigured,
  listAllSchedule,
  pushEntryToGoogle,
  updateSchedule,
  type ScheduleEntry,
} from "@/server/ragic/schedule";
import { addDefaultDuration } from "@/server/modules/dates";
import { errorMessage, json } from "@/server/http";

const PAST_DAYS = 7;
const WINDOW_DAYS = 180;
// 單次最多處理幾筆寫入，避免第一次補漏時超過函式執行時間；沒做完的下一輪接著做
const MAX_WRITES = 25;

function isValidKey(provided: string | null): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function taipeiYmd(offsetDays: number): string {
  return new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function sameContent(e: ScheduleEntry, item: CalendarItem): boolean {
  return (
    e.date === item.date &&
    e.start === item.start &&
    e.end === item.end &&
    e.title === item.title &&
    e.allDay === item.allDay &&
    e.location === item.location
  );
}

export async function GET(req: NextRequest) {
  if (!isValidKey(req.nextUrl.searchParams.get("key"))) {
    return json({ error: "unauthorized" }, 401);
  }
  const userId = process.env["LINE_USER_ID"];
  if (!userId) return json({ error: "LINE_USER_ID is not set" }, 500);
  if (!calendarConfigured()) return json({ error: "Google 日曆尚未設定" }, 503);
  if (!gcalFieldConfigured()) return json({ error: "行程表的「Google事件ID」欄位尚未設定（見 docs/11）" }, 503);

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const firstDay = taipeiYmd(-PAST_DAYS);
  const lastDay = taipeiYmd(WINDOW_DAYS);
  const log = { imported: [] as string[], linked: [] as string[], updated: [] as string[], cancelled: [] as string[], pushed: [] as string[] };
  let writes = 0;
  const budget = () => writes < MAX_WRITES;

  try {
    const googleEvents = await listGoogleEvents(`${firstDay}T00:00:00+08:00`, `${lastDay}T23:59:59+08:00`);
    const entries = (await listAllSchedule()).filter((e) => e.userId === userId && e.kind === "個人行程");
    const byGcalId = new Map(entries.filter((e) => e.gcalId).map((e) => [e.gcalId, e]));
    const seenGcalIds = new Set<string>();

    // 1)(2) 以 Google 為準處理新增與修改
    for (const ev of googleEvents) {
      if (!ev.id || ev.recurringEventId) continue;
      const item = eventToItem(ev);
      if (!item) continue;
      seenGcalIds.add(ev.id);
      const label = `${item.date} ${item.start} ${item.title}`;
      const linked = byGcalId.get(ev.id);

      if (linked) {
        const revived = linked.status === "取消"; // 在 Google 恢復了被取消的事件
        if (!revived && sameContent(linked, item)) continue;
        if (!budget()) continue;
        if (!dryRun) {
          await updateSchedule(
            linked.id,
            { ...item, status: revived ? "正常" : linked.status },
            { skipGoogle: true },
          );
        }
        writes++;
        log.updated.push(label);
        continue;
      }

      // 還沒連結：先找「同日期、同開始時間、同標題」且尚未連結的行程（舊行程或剛由工作台建立）
      const twin = entries.find((e) => !e.gcalId && e.status !== "取消" && e.date === item.date && e.start === item.start && e.title === item.title);
      if (twin) {
        if (!budget()) continue;
        if (!dryRun) await updateSchedule(twin.id, { gcalId: ev.id }, { skipGoogle: true });
        twin.gcalId = ev.id;
        writes++;
        log.linked.push(label);
        continue;
      }

      if (!budget()) continue;
      if (!dryRun) {
        await createSchedule(
          {
            userId,
            kind: "個人行程",
            date: item.date,
            start: item.start,
            end: item.end || addDefaultDuration(item.start),
            title: item.title,
            allDay: item.allDay,
            location: item.location,
            status: "正常",
            gcalId: ev.id,
          },
          { skipGoogle: true },
        );
      }
      writes++;
      log.imported.push(label);
    }

    // 3)(4) 以行程為準：還在窗口內、這輪沒在 Google 列表裡出現的行程
    for (const e of entries) {
      if (e.date < firstDay || e.date > lastDay) continue;
      if (e.gcalId && seenGcalIds.has(e.gcalId)) continue;
      const label = `${e.date} ${e.start} ${e.title}`;

      if (!e.gcalId) {
        if (e.status === "取消") continue;
        if (!budget()) continue;
        if (!dryRun) await pushEntryToGoogle(e);
        writes++;
        log.pushed.push(label);
        continue;
      }

      if (e.status === "取消") continue;
      // 有連結卻不在列表：被刪除，或被移到窗口以外／變成循環事件，逐筆確認
      const ev = await getGoogleEvent(e.gcalId);
      if (!ev || ev.status === "cancelled") {
        if (!budget()) continue;
        if (!dryRun) await updateSchedule(e.id, { status: "取消" }, { skipGoogle: true });
        writes++;
        log.cancelled.push(label);
        continue;
      }
      const item = eventToItem(ev);
      if (item && !sameContent(e, item)) {
        if (!budget()) continue;
        if (!dryRun) await updateSchedule(e.id, { ...item }, { skipGoogle: true });
        writes++;
        log.updated.push(label);
      }
    }

    return json({ dryRun, window: { from: firstDay, to: lastDay }, writes, truncated: writes >= MAX_WRITES, ...log });
  } catch (err) {
    console.error("Google日曆同步失敗:", err);
    // 診斷：帳號信箱不是機密，連同長度一起回傳，方便比對 Vercel 環境變數有沒有貼錯
    const email = process.env["GOOGLE_CLIENT_EMAIL"] ?? "";
    return json({ error: errorMessage(err, "internal error"), diag: { email: JSON.stringify(email), emailLength: email.length } }, 500);
  }
}
