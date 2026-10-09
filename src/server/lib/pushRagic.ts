// Web Push 訂閱資料的 Ragic 客戶端：一台裝置一筆（endpoint／p256dh／auth）。
// 跟 hrRagic.ts 同樣接在帳號根網址（QUOTATION_RAGIC_BASE_URL）底下、共用 RAGIC_API_KEY。
//
// ⚠️ 表單要先在 Ragic 手動建立（欄位規格見 docs/09-Web-Push推播-Ragic建表與設定.md），
// 建好後把下面 PUSH_SHEET 與 PUSH_FIELD 填上。只要還有任何一個是空字串，pushConfigured() 就回傳
// false，/api/push/* 回 503「尚未設定」、不打 Ragic。
//
// 讀寫慣例同其他 Ragic 客戶端：GET 回應用「中文欄位名稱」當 key（PUSH_READ_FIELD），
// POST 寫入用「欄位內部編號」（PUSH_FIELD），兩者混用會 HTTP 200 但什麼都沒寫進去。

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

// 表單在帳號底下的路徑（不含帳號根網址），例："ragicforms21/12"
export const PUSH_SHEET = "ragicforms21/12";

export const PUSH_FIELD = {
  裝置名稱: "1001481",
  endpoint: "1001482",
  p256dh: "1001483",
  auth: "1001484",
} as const;

export const PUSH_READ_FIELD = {
  裝置名稱: "裝置名稱",
  endpoint: "endpoint",
  p256dh: "p256dh",
  auth: "auth",
} as const;

export function pushConfigured(): boolean {
  return (PUSH_SHEET as string) !== "" && Object.values(PUSH_FIELD).every((v) => (v as string) !== "");
}

export function vapidConfigured(): boolean {
  return ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].every((k) => !!process.env[k]);
}

export interface PushSubscriptionRecord {
  id: number;
  deviceName: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function buildUrl(recordId?: number | string, extraQuery?: string): string {
  const idSegment = recordId !== undefined ? `/${recordId}` : "";
  const q = extraQuery ? `&${extraQuery}` : "";
  const key = encodeURIComponent(getEnv("RAGIC_API_KEY"));
  return `${getEnv("QUOTATION_RAGIC_BASE_URL")}/${PUSH_SHEET}${idSegment}?api&APIKey=${key}${q}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function listSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const res = await fetch(buildUrl(undefined, "limit=1000&subtables=0"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Record<string, Record<string, unknown>>;
  return Object.entries(data)
    .map(([id, r]) => ({
      id: Number(id),
      deviceName: str(r[PUSH_READ_FIELD.裝置名稱]),
      endpoint: str(r[PUSH_READ_FIELD.endpoint]),
      p256dh: str(r[PUSH_READ_FIELD.p256dh]),
      auth: str(r[PUSH_READ_FIELD.auth]),
    }))
    .filter((r) => r.endpoint && r.p256dh && r.auth);
}

async function checkWrite(res: Response, action: string): Promise<void> {
  if (!res.ok) throw new Error(`Ragic ${action}失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json().catch(() => null)) as { status?: string; msg?: string } | null;
  if (data?.status === "ERROR") throw new Error(`Ragic ${action}失敗: ${data.msg ?? "未知錯誤"}`);
}

// 同一個 endpoint 只留一筆：已存在就更新金鑰與裝置名稱，不存在才新增
export async function saveSubscription(sub: { deviceName: string; endpoint: string; p256dh: string; auth: string }): Promise<void> {
  const existing = (await listSubscriptions()).find((r) => r.endpoint === sub.endpoint);
  const body = new URLSearchParams([
    [PUSH_FIELD.裝置名稱, sub.deviceName],
    [PUSH_FIELD.endpoint, sub.endpoint],
    [PUSH_FIELD.p256dh, sub.p256dh],
    [PUSH_FIELD.auth, sub.auth],
  ]).toString();
  const res = await fetch(buildUrl(existing?.id), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  await checkWrite(res, existing ? "更新" : "新增");
}

export async function deleteSubscriptionById(id: number): Promise<void> {
  const res = await fetch(buildUrl(id), { method: "DELETE" });
  if (!res.ok) throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const found = (await listSubscriptions()).find((r) => r.endpoint === endpoint);
  if (found) await deleteSubscriptionById(found.id);
}
