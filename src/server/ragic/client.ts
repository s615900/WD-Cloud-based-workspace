// Ragic 客戶端：新版行事曆功能（班別模板／空檔設定／排班行程）專用，串接
// src/ragic/fields.ts 的 RAGIC_FOLDER_BASE 資料夾。跟 bot/ragic.ts（手機版任務表，
// RAGIC_BASE_URL）、lib/quotationRagic.ts（桌面接案模組，QUOTATION_RAGIC_BASE_URL）
// 是三個不同 workbook 的獨立客戶端，共用同一組 RAGIC_API_KEY，彼此不 import、不影響。
//
// 認證與查詢慣例沿用既有兩支：API Key 放網址 ?APIKey= 查詢字串、網址加 ?api 參數才回傳
// JSON；寫入用 application/x-www-form-urlencoded + URLSearchParams，欄位用 Ragic 內部
// 欄位編號（不是欄位名稱）。GET 回應用中文欄位名當 key，這兩者不對稱（見 fields.ts）。

import { sheetUrl, SHEET } from "./fields";

function apiKey(): string {
  const val = process.env["RAGIC_API_KEY"];
  if (!val) throw new Error("RAGIC_API_KEY is not set");
  return val;
}

function buildUrl(
  sheet: keyof typeof SHEET,
  recordId?: number | string,
  extraQuery?: string,
): string {
  const idSegment = recordId !== undefined ? `/${recordId}` : "";
  const q = extraQuery ? `&${extraQuery}` : "";
  return `${sheetUrl(sheet)}${idSegment}?api&APIKey=${encodeURIComponent(apiKey())}${q}`;
}

export type RagicRecordData = Record<string, unknown>;

// 查詢整張表（GET，無 recordId）：回傳物件，key 是 Ragic 內部紀錄編號（字串數字），
// value 是該筆紀錄的欄位資料（用中文欄位名當 key）。
export async function ragicList(
  sheet: keyof typeof SHEET,
  extraQuery?: string,
): Promise<Record<string, RagicRecordData>> {
  const res = await fetch(buildUrl(sheet, undefined, extraQuery));
  if (!res.ok) {
    throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, RagicRecordData>>;
}

// 查詢單筆紀錄：Ragic 即使指定 recordId，回應仍包成「用紀錄編號當 key」的物件
// （例如 {"7": {...}}），查無紀錄時回應是空物件 {}。
export async function ragicGetOne(
  sheet: keyof typeof SHEET,
  recordId: number | string,
): Promise<RagicRecordData> {
  const res = await fetch(buildUrl(sheet, recordId));
  if (!res.ok) {
    throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, RagicRecordData>;
  return data[String(recordId)] ?? Object.values(data)[0] ?? {};
}

interface RagicCreateResponse {
  ragicId?: number;
  [key: string]: unknown;
}

// 新增一筆紀錄，回傳 Ragic 配發的紀錄編號（ragicId）
export async function ragicCreate(
  sheet: keyof typeof SHEET,
  fields: Record<string, string>,
): Promise<number> {
  const res = await fetch(buildUrl(sheet), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) {
    throw new Error(`Ragic 新增失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as RagicCreateResponse;
  if (typeof data.ragicId !== "number") {
    throw new Error(`Ragic 新增成功但回應缺少 ragicId，無法確認新紀錄編號: ${JSON.stringify(data)}`);
  }
  return data.ragicId;
}

// 更新一筆既有紀錄的部分欄位
export async function ragicUpdate(
  sheet: keyof typeof SHEET,
  recordId: number | string,
  fields: Record<string, string>,
): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) {
    throw new Error(`Ragic 更新失敗: ${res.status} ${await res.text()}`);
  }
}

export async function ragicDelete(sheet: keyof typeof SHEET, recordId: number | string): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
  }
}
