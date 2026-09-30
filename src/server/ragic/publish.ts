// 空檔公布文字組字：純函式，不碰 Ragic、不呼叫 LINE，方便獨立單元測試（比照 freeSlots.ts
// 的分層方式）。格式規格見 docs 積木式工單 W-005：
// - 往後 publishDays 天內完全沒有任何空檔時，整則訊息只有「本週已排滿，下週再約。」
// - 連續日期且時段組合完全相同者合併為一組區間顯示，減少手機上要捲動的行數
// - 預約連結（1001415）為空字串時，省略最後的連結區塊，只留空檔清單
// - 這裡只組文字，實際推播、要不要寫紀錄由呼叫端（routes/rosterPublish.ts）決定
import type { FreeSlot } from "./freeSlots";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export interface PublishDay {
  date: string; // yyyy-MM-dd
  slots: FreeSlot[];
}

interface SlotGroup {
  startDate: string;
  endDate: string;
  slots: FreeSlot[];
}

function addOneDay(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function slotSignature(slots: FreeSlot[]): string {
  return slots.map((s) => `${s.start}|${s.end}`).join(",");
}

// 只合併日曆上真正相鄰（前一組結束日+1＝這天）且時段組合完全相同的日期；
// 中間被濾掉的無空檔日會讓 addOneDay 對不上，兩側就不會被錯誤合併。
function groupConsecutiveDays(days: PublishDay[]): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && addOneDay(last.endDate) === day.date && slotSignature(last.slots) === slotSignature(day.slots)) {
      last.endDate = day.date;
    } else {
      groups.push({ startDate: day.date, endDate: day.date, slots: day.slots });
    }
  }
  return groups;
}

function formatDayHeader(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
  return `${m}/${d}（${weekday}）`;
}

function formatGroupHeader(group: SlotGroup): string {
  if (group.startDate === group.endDate) return formatDayHeader(group.startDate);
  return `${formatDayHeader(group.startDate)}～${formatDayHeader(group.endDate)}`;
}

export function buildPublishText(days: PublishDay[], bookingUrl: string): string {
  const withSlots = days.filter((d) => d.slots.length > 0);
  if (withSlots.length === 0) return "本週已排滿，下週再約。";

  const groups = groupConsecutiveDays(withSlots);

  const lines: string[] = ["【可預約時段】"];
  for (const group of groups) {
    lines.push("");
    lines.push(formatGroupHeader(group));
    for (const slot of group.slots) {
      lines.push(`　${slot.start}–${slot.end}`);
    }
  }

  const trimmedUrl = bookingUrl.trim();
  if (trimmedUrl) {
    lines.push("");
    lines.push(`▸ 預約：${trimmedUrl}`);
  }

  return lines.join("\n");
}

// 真實公布推播用的精簡版本：完整時段清單只留給 dryRun 預覽跟 calendar.html 的公布前
// 檢視 modal，實際推播給自己的 LINE 訊息只需要「有更新了」跟連結，兩行看完就好，
// 不用重新讀一次可能已經在腦中的時段清單。連結為空字串時只顯示第一行。
export function buildShortPublishText(bookingUrl: string): string {
  const trimmedUrl = bookingUrl.trim();
  if (!trimmedUrl) return "✅ 空檔已更新";
  return `✅ 空檔已更新\n▸ ${trimmedUrl}`;
}
