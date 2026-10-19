// 財務模組自己的日期小工具。共用的 toRagicDate／freeSlot.ts 的 normalizeRagicDate 都只讀不改，
// 這裡另外包一層（06 工單規定：共用 helper 不夠用時在財務模組內自己包）。

// Ragic 日期欄位 GET 回 yyyy/MM/dd（也可能帶時間），統一轉成 yyyy-MM-dd。認不得格式就回空字串。
export function normalizeRagicDate(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const m = raw.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

// 建立時間欄位用：Asia/Taipei 的 yyyy/MM/dd HH:mm:ss
export function nowTaipeiStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? "00";
  return `${p("year")}/${p("month")}/${p("day")} ${p("hour")}:${p("minute")}:${p("second")}`;
}

// yyyy-MM-dd 是否為真實存在的日期（擋掉 2026-02-31 這類）
export function isRealDate(ymd: string): boolean {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function nextMonth(yyyyMM: string): string {
  const y = Number(yyyyMM.slice(0, 4));
  const m = Number(yyyyMM.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

// ── 純日期運算（yyyy-MM-dd／yyyy-MM 字串，不牽涉時區）──

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 日期超過該月天數就夾到月底（執行日 29–31 遇小月自動夾到月底）
export function clampYMD(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
}

export function addMonthsYM(yyyyMM: string, n: number): string {
  const y = Number(yyyyMM.slice(0, 4));
  const m0 = Number(yyyyMM.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m0 / 12);
  const mm = ((m0 % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1)}`;
}

// 日期往後加 n 個月，日夾到月底
export function addMonthsYMD(ymd: string, n: number, day = Number(ymd.slice(8, 10))): string {
  const ym = addMonthsYM(ymd.slice(0, 7), n);
  return clampYMD(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), day);
}

export function addDaysYMD(ymd: string, n: number): string {
  const dt = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function monthsBetween(aYM: string, bYM: string): number {
  return (Number(bYM.slice(0, 4)) - Number(aYM.slice(0, 4))) * 12 + (Number(bYM.slice(5, 7)) - Number(aYM.slice(5, 7)));
}

// 1 = 週一 … 7 = 週日
export function weekdayOf(ymd: string): number {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))).getUTCDay();
  return d === 0 ? 7 : d;
}

// from～to（含頭尾）每一天；from > to 回空陣列
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYMD(d, 1)) out.push(d);
  return out;
}
