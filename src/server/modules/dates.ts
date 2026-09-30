// yyyy-MM-dd 加減天數，純日曆天數加法（不牽涉時區換算，輸入輸出都只是日期字串）。
export function addDays(yyyyMMdd: string, n: number): string {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 「個人行程」沒有明確結束時間時的預設時長（分鐘），跟 Google 日曆同步用同一個假設。
// 超過 23:59 就夾到 23:59，不跨到隔天。
const DEFAULT_TRIP_DURATION_MIN = 60;

export function addDefaultDuration(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const total = Math.min((h ?? 0) * 60 + (m ?? 0) + DEFAULT_TRIP_DURATION_MIN, 23 * 60 + 59);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 前端日期輸入是 yyyy-MM-dd（<input type="date">），Ragic 日期欄位格式是 yyyy/MM/dd
export function toRagicDate(v: string): string {
  return v.replaceAll("-", "/");
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
