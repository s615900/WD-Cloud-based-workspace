// 前端頁面共用的小工具（原本 public/desktop/common.js 的 DesktopCommon）：
// fetch 包裝（統一處理錯誤訊息）、台北時區日期字串、金額格式。

// 統一處理 API 回應：非 2xx 或 body.success === false 都丟出 Error，訊息取自 body.error。
export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    // /auth/login 是 Route Handler（會轉去 LINE Login），要整頁跳轉，不能用 router.push
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/auth/login";
    throw new Error("未登入，導向登入頁");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 沒有 JSON body（例如空回應）就當作沒有額外資訊
  }
  const body = data as { success?: boolean; error?: string } | null;
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

// JSON body 的 POST／PATCH 縮寫
export function sendJson<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function errorText(err: unknown, fallback = "發生錯誤"): string {
  return err instanceof Error ? err.message : fallback;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function addMonths(monthStr: string, delta: number): string {
  let year = parseInt(monthStr.slice(0, 4), 10);
  let month = parseInt(monthStr.slice(5, 7), 10) - 1 + delta;
  year += Math.floor(month / 12);
  month = ((month % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// yyyy-MM-dd 加減天數，純日曆天數加法（不牽涉時區換算）
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 某個月份的日期格子：前面補 null 對齊星期，後面是 yyyy-MM-dd
export function monthCells(month: string): (string | null)[] {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7)) - 1;
  const startWeekday = new Date(Date.UTC(year, mon, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: startWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  return cells;
}

export function formatCurrency(n: unknown): string {
  const rounded = Math.round((Number(n) || 0) * 100) / 100;
  return "$" + rounded.toLocaleString("en-US");
}

// Ragic 日期欄位是 yyyy/MM/dd，<input type="date"> 要 yyyy-MM-dd
export function toInputDate(v: string | undefined | null): string {
  return (v ?? "").replaceAll("/", "-");
}

// 產生客戶簽署頁的公開連結，讓使用者複製傳給客戶
export async function promptSignLink(kind: "quotes" | "contracts", id: number | string): Promise<void> {
  try {
    const result = await apiFetch<{ token: string }>(`/api/${kind}/${id}/sign-link`, { method: "POST" });
    const page = kind === "quotes" ? "quote-sign" : "contract-sign";
    const url = `${window.location.origin}/${page}?token=${result.token}`;
    window.prompt("請複製以下連結傳送給客戶（開啟連結免登入）：", url);
  } catch (err) {
    alert("產生連結失敗：" + errorText(err));
  }
}
