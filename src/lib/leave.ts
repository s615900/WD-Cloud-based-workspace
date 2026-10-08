// 人事假勤：依勞動基準法第 38 條、勞工請假規則（115/1/1 修正施行）、性別平等工作法
// 計算特休與各假別用量。純函式、日期一律用 yyyy-MM-dd 字串（不牽涉時區），前端畫面與
// 單元測試（leave.test.ts）共用。
//
// 計算口徑（法定最低標準）：
// - 特休採「週年制」：自到職日起算，滿 6 個月 3 日、滿 1 年 7 日、滿 2 年 10 日、
//   滿 3 年 14 日、滿 5 年 15 日、滿 10 年起每年加 1 日至 30 日。
// - 事假、病假採「曆年」（1/1–12/31）統計。
// - 家庭照顧假併入事假計算（全年 7 日＝56 小時）。
// - 生理假全年 3 日內不併入病假，超過的部分併入病假。
// - 一日以 8 小時計。

export const HOURS_PER_DAY = 8;

export interface LeaveTypeInfo {
  name: string;
  pay: string;
  limit: string;
  quotaDays?: number;
  note: string;
}

// name 就是寫進 Ragic「假別」欄位的值
export const LEAVE_TYPES: LeaveTypeInfo[] = [
  { name: "特休", pay: "全薪", limit: "依年資", note: "勞基法第 38 條，週年制計算" },
  { name: "事假", pay: "不給薪", limit: "14 日／年", quotaDays: 14, note: "含家庭照顧假" },
  {
    name: "家庭照顧假",
    pay: "不給薪",
    limit: "7 日（56 小時）／年",
    quotaDays: 7,
    note: "併入事假計算，可按小時請，不得扣全勤",
  },
  {
    name: "普通傷病假",
    pay: "半薪",
    limit: "30 日／年（未住院）",
    quotaDays: 30,
    note: "一年 10 日內雇主不得不利處分；住院者 2 年內合計不超過 1 年",
  },
  { name: "生理假", pay: "半薪", limit: "每月 1 日", quotaDays: 12, note: "全年 3 日內不併入病假，超過部分併入病假" },
  { name: "婚假", pay: "全薪", limit: "8 日", quotaDays: 8, note: "每次結婚" },
  {
    name: "喪假",
    pay: "全薪",
    limit: "8／6／3 日",
    note: "父母、養父母、繼父母、配偶 8 日；祖父母、子女、配偶之父母等 6 日；曾祖父母、兄弟姊妹等 3 日",
  },
  { name: "公傷病假", pay: "全薪", limit: "依實際需要", note: "職業災害醫療期間" },
  { name: "公假", pay: "全薪", limit: "依實際需要", note: "兵役、選舉投票等" },
  { name: "產假", pay: "全薪或半薪", limit: "8 週", quotaDays: 56, note: "受僱滿 6 個月全薪，未滿半薪；流產另依週數給假" },
  { name: "產檢假", pay: "全薪", limit: "7 日", quotaDays: 7, note: "妊娠期間" },
  { name: "陪產檢及陪產假", pay: "全薪", limit: "7 日", quotaDays: 7, note: "配偶妊娠或分娩" },
];

export const LEAVE_TYPE_NAMES = LEAVE_TYPES.map((t) => t.name);

export function leaveTypeInfo(name: string): LeaveTypeInfo | undefined {
  return LEAVE_TYPES.find((t) => t.name === name);
}

// ── 日期 ────────────────────────────────────────────────────────

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 加月份：日期超過該月天數時夾到月底（1/31 + 1 個月 = 2/28 或 2/29）
export function addMonthsYMD(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return fmt(ny, nm, Math.min(d, last));
}

export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// 到 ref 為止滿了幾個月；還沒到職回傳 -1
export function monthsServed(hire: string, ref: string): number {
  const [hy, hm] = parts(hire);
  const [ry, rm] = parts(ref);
  let months = (ry - hy) * 12 + (rm - hm);
  if (ref < addMonthsYMD(hire, months)) months -= 1;
  return Math.max(months, -1);
}

export function seniorityText(hire: string, ref: string): string {
  const m = monthsServed(hire, ref);
  if (m < 0) return "未到職";
  const y = Math.floor(m / 12);
  return `${y ? `${y} 年 ` : ""}${m % 12} 個月`;
}

// ── 特休 ────────────────────────────────────────────────────────

// 滿 y 年（y ≥ 1）的特休日數
export function annualDaysForYears(y: number): number {
  if (y < 1) return 3;
  if (y === 1) return 7;
  if (y === 2) return 10;
  if (y < 5) return 14;
  if (y < 10) return 15;
  return Math.min(30, 15 + (y - 9));
}

export interface AnnualPeriod {
  days: number; // 本週期應給日數（未滿 6 個月為 0）
  start: string | null; // 本週期起日（含）
  end: string; // 本週期迄日（不含）＝下一週期起日
  nextDays: number; // 下一週期應給日數
}

export function annualPeriod(hire: string, ref: string): AnnualPeriod {
  const m = monthsServed(hire, ref);
  if (m < 6) return { days: 0, start: null, end: addMonthsYMD(hire, 6), nextDays: 3 };
  if (m < 12) return { days: 3, start: addMonthsYMD(hire, 6), end: addMonthsYMD(hire, 12), nextDays: 7 };
  const y = Math.floor(m / 12);
  return {
    days: annualDaysForYears(y),
    start: addMonthsYMD(hire, 12 * y),
    end: addMonthsYMD(hire, 12 * (y + 1)),
    nextDays: annualDaysForYears(y + 1),
  };
}

// ── 用量統計 ─────────────────────────────────────────────────────

export interface LeaveLike {
  employeeId: number;
  type: string;
  date: string; // yyyy-MM-dd
  hours: number;
}

export function annualUsedHours(leaves: LeaveLike[], employeeId: number, period: AnnualPeriod): number {
  if (!period.start) return 0;
  const start = period.start;
  return leaves
    .filter((l) => l.employeeId === employeeId && l.type === "特休" && l.date >= start && l.date < period.end)
    .reduce((sum, l) => sum + l.hours, 0);
}

export interface YearStats {
  personalHours: number; // 事假＋家庭照顧假
  familyHours: number;
  sickHours: number; // 普通傷病假＋生理假超過 3 日的部分
  menstrualHours: number;
  byType: Record<string, number>;
}

export function yearStats(leaves: LeaveLike[], employeeId: number, year: number): YearStats {
  const prefix = `${year}-`;
  const byType: Record<string, number> = {};
  for (const l of leaves) {
    if (l.employeeId !== employeeId || !l.date.startsWith(prefix)) continue;
    byType[l.type] = (byType[l.type] ?? 0) + l.hours;
  }
  const get = (t: string) => byType[t] ?? 0;
  const menstrual = get("生理假");
  return {
    personalHours: get("事假") + get("家庭照顧假"),
    familyHours: get("家庭照顧假"),
    sickHours: get("普通傷病假") + Math.max(0, menstrual - 3 * HOURS_PER_DAY),
    menstrualHours: menstrual,
    byType,
  };
}

// ── 顯示 ────────────────────────────────────────────────────────

export function formatHours(h: number): string {
  if (h % HOURS_PER_DAY === 0) return `${h / HOURS_PER_DAY} 日`;
  if (h < HOURS_PER_DAY) return `${h} 小時`;
  const d = Math.floor(h / HOURS_PER_DAY);
  return `${d} 日 ${h - d * HOURS_PER_DAY} 小時`;
}

// 小時換算成日數（最多兩位小數）
export function hoursToDays(h: number): number {
  return Math.round((h / HOURS_PER_DAY) * 100) / 100;
}
