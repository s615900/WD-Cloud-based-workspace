// 空檔推算：純函式，不碰 Ragic、不吃 I/O，方便獨立單元測試。
// 演算法見 docs/02-Claude-Code實作指示-行事曆.md 第五節，測試案例見 docs/05。

export interface ScheduleEntry {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  allDay: boolean;
  status: string;
}

export interface FreeSlotConfig {
  dayStart: string; // "HH:mm"
  dayEnd: string; // "HH:mm"
  bufferBefore: number; // 分鐘
  bufferAfter: number; // 分鐘
  minSlot: number; // 分鐘
  roundTo: number; // 分鐘
}

export interface FreeSlot {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

const CANCELLED_STATUS = "取消";
const MINUTES_PER_DAY = 1440;

interface Interval {
  s: number;
  e: number;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function toHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 步驟 1：建立 busy 清單（用原始、未套緩衝的時間；跨日行程在這一步就切段）
function buildBusyIntervals(
  todaySchedule: ScheduleEntry[],
  prevDaySchedule: ScheduleEntry[],
): Interval[] {
  const busy: Interval[] = [];

  // 1a：當日行程
  for (const entry of todaySchedule) {
    if (entry.status === CANCELLED_STATUS) continue;
    if (entry.allDay) {
      busy.push({ s: 0, e: MINUTES_PER_DAY });
      continue;
    }
    const s = toMinutes(entry.start);
    let e = toMinutes(entry.end);
    if (e <= s) e = MINUTES_PER_DAY; // 跨日：切到當日的 24:00 為止
    busy.push({ s, e });
  }

  // 1b：前一日跨日行程延續到今天的部分（延續段用原始結束時間，緩衝留到步驟 2 統一套）
  for (const entry of prevDaySchedule) {
    if (entry.status === CANCELLED_STATUS) continue;
    if (entry.allDay) continue;
    const s = toMinutes(entry.start);
    const e = toMinutes(entry.end);
    if (e <= s) {
      busy.push({ s: 0, e });
    }
  }

  return busy;
}

// 步驟 2：套緩衝
function applyBuffer(busy: Interval[], bufferBefore: number, bufferAfter: number): Interval[] {
  return busy.map(({ s, e }) => ({ s: s - bufferBefore, e: e + bufferAfter }));
}

// 步驟 3：依開始時間排序，合併重疊區間
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.s - b.s);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.s <= last.e) {
      last.e = Math.max(last.e, cur.e);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

// 步驟 4：以 [dayStart, dayEnd] 為視窗，取 busy 的補集
function complementWithinWindow(busy: Interval[], dayStart: number, dayEnd: number): Interval[] {
  const clipped = busy
    .map(({ s, e }) => ({ s: Math.max(s, dayStart), e: Math.min(e, dayEnd) }))
    .filter(({ s, e }) => e > s);

  const gaps: Interval[] = [];
  let cursor = dayStart;
  for (const b of clipped) {
    if (b.s > cursor) gaps.push({ s: cursor, e: b.s });
    cursor = Math.max(cursor, b.e);
  }
  if (cursor < dayEnd) gaps.push({ s: cursor, e: dayEnd });
  return gaps;
}

// 步驟 5：對齊，一律往內縮（開始無條件進位、結束無條件捨去），不可四捨五入——
// 往外擴會把實際被佔用的時間公布出去。
function roundInward(gaps: Interval[], roundTo: number): Interval[] {
  return gaps.map(({ s, e }) => ({
    s: Math.ceil(s / roundTo) * roundTo,
    e: Math.floor(e / roundTo) * roundTo,
  }));
}

export function computeFreeSlots(
  todaySchedule: ScheduleEntry[],
  prevDaySchedule: ScheduleEntry[],
  config: FreeSlotConfig,
): FreeSlot[] {
  const busy = buildBusyIntervals(todaySchedule, prevDaySchedule);
  const buffered = applyBuffer(busy, config.bufferBefore, config.bufferAfter);
  const merged = mergeIntervals(buffered);
  const gaps = complementWithinWindow(merged, toMinutes(config.dayStart), toMinutes(config.dayEnd));
  const rounded = roundInward(gaps, config.roundTo);

  // 步驟 6：過濾小於 minSlot 的碎片
  return rounded
    .filter(({ s, e }) => e - s >= config.minSlot)
    .map(({ s, e }) => ({ start: toHM(s), end: toHM(e) }));
}
