// 新版行事曆功能：空檔公布。讀「空檔設定」的公布天數／預約連結，從今天起算未來 N 天的空檔
// （沿用 ragic/freeSlots.ts 同一套演算法），組成文字（ragic/publish.ts），推播給自己。
//
// 公布時同步把本次推算結果寫入 /ragicforms21/9，讓 /book 預約頁有資料可讀。寫入前先清掉
// 「預約狀態＝可預約」的舊記錄，避免重複公布時同一時段疊加；已預約／已取消的記錄不會被動到。
// 推算結果會排除已經「待確認」或「已預約」的時段，避免公布把這些時段蓋回「可預約」。
// ?dryRun=1 維持純預覽：完全不進入刪除／寫入／推播。
import type { NextRequest } from "next/server";
import { pushTextMessageToOwner } from "@/server/bot/linePush";
import { listAllSchedule, genScheduleCode, type ScheduleEntry } from "@/server/ragic/schedule";
import { computeFreeSlots } from "@/server/ragic/freeSlots";
import { buildPublishText, buildShortPublishText, type PublishDay } from "@/server/ragic/publish";
import {
  getCancellableFreeSlotIds,
  deleteFreeSlotFromRagic,
  saveFreeSlotToRagic,
  getPendingOrConfirmedSlotKeys,
} from "@/server/bot/ragic";
import { loadRosterConfig, toFreeSlotEntry } from "@/server/modules/roster";
import { addDays, todayYMD } from "@/server/modules/dates";
import { errorMessage, json } from "@/server/http";

async function buildTodaysPublishText(): Promise<
  | { text: string; pushText: string; days: string[]; publishDays: PublishDay[]; skippedCount: number }
  | { error: string }
> {
  const config = await loadRosterConfig();
  if (!config) return { error: "空檔設定尚未建立" };
  if (!Number.isInteger(config.publishDays) || config.publishDays <= 0) {
    return { error: "公布天數尚未設定（須為大於 0 的整數）" };
  }

  const start = todayYMD();
  const dates = Array.from({ length: config.publishDays }, (_, i) => addDays(start, i));

  const all = await listAllSchedule();
  const byDate = new Map<string, ScheduleEntry[]>();
  for (const e of all) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const days: PublishDay[] = dates.map((date) => {
    const today = (byDate.get(date) ?? []).map(toFreeSlotEntry);
    const prev = (byDate.get(addDays(date, -1)) ?? []).map(toFreeSlotEntry);
    return { date, slots: computeFreeSlots(today, prev, config) };
  });

  // 排除已經有客戶「待確認」或「已預約」的時段——dryRun 預覽跟實際公布共用這裡算出的 days。
  const pendingOrConfirmedKeys = await getPendingOrConfirmedSlotKeys();
  let skippedCount = 0;
  const filteredDays: PublishDay[] = days.map((day) => ({
    date: day.date,
    slots: day.slots.filter((slot) => {
      const key = `${day.date}|${slot.start}|${slot.end}`;
      if (!pendingOrConfirmedKeys.has(key)) return true;
      skippedCount++;
      return false;
    }),
  }));

  return {
    // dryRun 預覽用：完整時段清單
    text: buildPublishText(filteredDays, config.bookingUrl),
    // 真實公布推播用：精簡成兩行
    pushText: buildShortPublishText(config.bookingUrl),
    days: dates,
    publishDays: filteredDays,
    skippedCount,
  };
}

export async function POST(req: NextRequest) {
  try {
    const result = await buildTodaysPublishText();
    if ("error" in result) {
      return json({ success: false, error: result.error }, 500);
    }

    if (req.nextUrl.searchParams.get("dryRun") === "1") {
      return json({ success: true, pushed: false, dryRun: true, days: result.days, text: result.text });
    }

    // 先清掉前一次公布留下、還沒被預約的舊空檔記錄，避免重複公布疊加。
    const cancellableIds = await getCancellableFreeSlotIds();
    let deletedCount = 0;
    for (const id of cancellableIds) {
      try {
        await deleteFreeSlotFromRagic(id);
        deletedCount++;
      } catch (err) {
        console.error("空檔公布：清除舊記錄失敗", err);
        return json(
          {
            success: false,
            error: `清除舊空檔記錄中斷：已刪除 ${deletedCount} 筆，刪除失敗於 id=${id}：${errorMessage(err, "刪除失敗")}`,
            deletedCount,
            insertedCount: 0,
          },
          500,
        );
      }
    }

    // 寫入本次推算結果。任一筆失敗就立即中止、不推播 LINE，讓使用者知道要重新公布一次。
    const batchId = genScheduleCode("PUB");
    const slotsToInsert = result.publishDays.flatMap((day) =>
      day.slots.map((slot) => ({ date: day.date, start: slot.start, end: slot.end })),
    );
    let insertedCount = 0;
    for (const slot of slotsToInsert) {
      try {
        await saveFreeSlotToRagic(slot.date, slot.start, slot.end, batchId);
        insertedCount++;
      } catch (err) {
        console.error("空檔公布：寫入新記錄失敗", err);
        return json(
          {
            success: false,
            error: `空檔寫入中斷：已刪除 ${deletedCount} 筆舊記錄，已成功寫入 ${insertedCount} 筆，寫入失敗於 ${slot.date} ${slot.start}-${slot.end}：${errorMessage(err, "寫入失敗")}`,
            deletedCount,
            insertedCount,
            failedSlot: slot,
          },
          500,
        );
      }
    }

    await pushTextMessageToOwner(result.pushText);
    return json({
      success: true,
      pushed: true,
      days: result.days,
      text: result.pushText,
      deletedCount,
      insertedCount,
      skippedCount: result.skippedCount,
    });
  } catch (err) {
    console.error("空檔公布推播失敗:", err);
    return json({ success: false, error: errorMessage(err, "推播失敗") }, 500);
  }
}
