// 人事假勤模組的 Ragic 客戶端：員工資料、請假紀錄兩張表。
// 跟 quotationRagic.ts 一樣接在帳號根網址（QUOTATION_RAGIC_BASE_URL，例：
// https://ap15.ragic.com/qsprint）底下，共用 RAGIC_API_KEY；但這支只給 /api/hr/* 使用，
// 不 import、也不影響接案商業模組或行事曆。
//
// ⚠️ 兩張表要先在 Ragic 手動建立（欄位規格見 docs/08-人事假勤模組-Ragic建表與積木式工單.md），
// 建好後把下面 HR_SHEET 的路徑與 *_FIELD 的欄位編號填上。只要還有任何一個是空字串，
// hrConfigured() 就回傳 false，API 一律回 503「尚未設定」、不打 Ragic，頁面顯示設定說明。
//
// 讀寫慣例同其他 Ragic 客戶端：GET 回應用「中文欄位名稱」當 key（*_READ_FIELD），
// POST 寫入用「欄位內部編號」（*_FIELD），兩者混用會 HTTP 200 但什麼都沒寫進去。
// 日期欄位寫入用 yyyy/MM/dd（toRagicDate），讀回來也是 yyyy/MM/dd，前端要轉成 yyyy-MM-dd。

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

// 表單在帳號底下的路徑（不含帳號根網址），例："hr/1"
export const HR_SHEET = {
  employees: "",
  leaves: "",
} as const;

// ────────────────────────────────────────────────────────────────
// 員工資料
// ────────────────────────────────────────────────────────────────

export const EMPLOYEE_FIELD = {
  員工編號: "",
  姓名: "",
  部門: "",
  職稱: "",
  到職日: "",
  性別: "",
  電話: "",
  Email: "",
  在職狀態: "",
  離職日: "",
  備註: "",
} as const;

export const EMPLOYEE_READ_FIELD = {
  員工編號: "員工編號",
  姓名: "姓名",
  部門: "部門",
  職稱: "職稱",
  到職日: "到職日",
  性別: "性別",
  電話: "電話",
  Email: "Email",
  在職狀態: "在職狀態",
  離職日: "離職日",
  備註: "備註",
} as const;

// ────────────────────────────────────────────────────────────────
// 請假紀錄：員工用「員工紀錄編號」（員工資料表的 Ragic 內部紀錄編號，純文字）關聯，
// 不用 Ragic 連結欄位——連結欄位寫入要用對方的顯示值、規則容易踩雷，這裡不需要。
// 「員工姓名」只是方便在 Ragic 後台直接看，程式不依賴它。
// ────────────────────────────────────────────────────────────────

export const LEAVE_FIELD = {
  員工紀錄編號: "",
  員工姓名: "",
  假別: "",
  請假日期: "",
  時數: "",
  備註: "",
} as const;

export const LEAVE_READ_FIELD = {
  員工紀錄編號: "員工紀錄編號",
  員工姓名: "員工姓名",
  假別: "假別",
  請假日期: "請假日期",
  時數: "時數",
  備註: "備註",
} as const;

export function hrConfigured(): boolean {
  return [HR_SHEET, EMPLOYEE_FIELD, LEAVE_FIELD].every((group) => Object.values(group).every((v) => v !== ""));
}

type SheetKey = keyof typeof HR_SHEET;

function buildUrl(sheet: SheetKey, recordId?: number | string, extraQuery?: string): string {
  const idSegment = recordId !== undefined ? `/${recordId}` : "";
  const q = extraQuery ? `&${extraQuery}` : "";
  const key = encodeURIComponent(getEnv("RAGIC_API_KEY"));
  return `${getEnv("QUOTATION_RAGIC_BASE_URL")}/${HR_SHEET[sheet]}${idSegment}?api&APIKey=${key}${q}`;
}

export type RagicRecordData = Record<string, unknown>;

// 預設 Ragic 一次最多回 1000 筆；人事資料量小，用 limit 一次取完
export async function hrList(sheet: SheetKey, extraQuery = "limit=10000&subtables=0"): Promise<Record<string, RagicRecordData>> {
  const res = await fetch(buildUrl(sheet, undefined, extraQuery), { cache: "no-store" });
  if (!res.ok) throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Record<string, RagicRecordData>>;
}

// 單筆查詢：回應仍包成「用紀錄編號當 key」的物件，查無紀錄時是空物件 {}（回傳 null）
export async function hrGetOne(sheet: SheetKey, recordId: number | string): Promise<RagicRecordData | null> {
  const res = await fetch(buildUrl(sheet, recordId), { cache: "no-store" });
  if (!res.ok) throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Record<string, RagicRecordData>;
  return data[String(recordId)] ?? Object.values(data)[0] ?? null;
}

// Ragic 欄位驗證失敗時仍回 HTTP 200，要看回應的 status 才知道有沒有真的寫進去
async function checkWrite(res: Response, action: string): Promise<{ ragicId?: number }> {
  if (!res.ok) throw new Error(`Ragic ${action}失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json().catch(() => null)) as { status?: string; msg?: string; ragicId?: number } | null;
  if (data?.status === "ERROR") throw new Error(`Ragic ${action}失敗: ${data.msg ?? "未知錯誤"}`);
  return data ?? {};
}

export async function hrCreate(sheet: SheetKey, fields: Record<string, string>): Promise<number> {
  const res = await fetch(buildUrl(sheet), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  const data = await checkWrite(res, "新增");
  if (typeof data.ragicId !== "number") {
    throw new Error(`Ragic 新增成功但回應缺少 ragicId: ${JSON.stringify(data)}`);
  }
  return data.ragicId;
}

export async function hrUpdate(sheet: SheetKey, recordId: number | string, fields: Record<string, string>): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  await checkWrite(res, "更新");
}

export async function hrDelete(sheet: SheetKey, recordId: number | string): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), { method: "DELETE" });
  if (!res.ok) throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
}
