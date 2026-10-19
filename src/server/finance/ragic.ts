// 財務模組的 Ragic 讀寫包裝。接在帳號根網址（QUOTATION_RAGIC_BASE_URL，例：https://ap15.ragic.com/qsprint）
// 底下的 /personal-finance-module/N，共用 RAGIC_API_KEY；只給 /api/finance/* 使用，
// 不 import、也不影響其他模組的 Ragic client。
//
// 讀寫不對稱：GET 回應用中文欄位名當 key；寫入一律用數字欄位編號（見 ragicFields.ts）。
// ⚠️ record id 0 是有效值（每張表第一筆就是 0），所有判斷都用 typeof／正規表示式，不可用 falsy。

import { FINANCE_SHEETS, type FinanceSheet } from "./ragicFields";

function env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

function buildUrl(sheet: FinanceSheet, recordId?: number | string, extraQuery?: string): string {
  const idSegment = recordId !== undefined ? `/${recordId}` : "";
  const q = extraQuery ? `&${extraQuery}` : "";
  return `${env("QUOTATION_RAGIC_BASE_URL")}${FINANCE_SHEETS[sheet]}${idSegment}?api&v=3&APIKey=${encodeURIComponent(env("RAGIC_API_KEY"))}${q}`;
}

export type FinanceRecord = Record<string, unknown>;
export type FinanceRow = { id: string; rec: FinanceRecord };

// 寫入用欄位：key 是數字欄位編號
export type WriteFields = Record<number, string | number>;

function toForm(fields: WriteFields): string {
  const p = new URLSearchParams();
  for (const [id, v] of Object.entries(fields)) p.set(id, String(v));
  return p.toString();
}

// 查整張表（或帶 where 條件），回傳依紀錄編號排序的陣列。Ragic 回傳的 key 是紀錄編號字串。
export async function finList(sheet: FinanceSheet, extraQuery?: string): Promise<FinanceRow[]> {
  const res = await fetch(buildUrl(sheet, undefined, `limit=10000&subtables=0${extraQuery ? `&${extraQuery}` : ""}`), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Record<string, FinanceRecord>;
  return Object.entries(data)
    .map(([id, rec]) => ({ id, rec }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// 新增一筆，回傳 Ragic 配發的紀錄編號（可能是 0）
export async function finCreate(sheet: FinanceSheet, fields: WriteFields): Promise<number> {
  const res = await fetch(buildUrl(sheet), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toForm(fields),
  });
  if (!res.ok) throw new Error(`Ragic 新增失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { status?: string; msg?: string; ragicId?: number };
  if (data.status === "ERROR") throw new Error(`Ragic 新增失敗: ${data.msg ?? JSON.stringify(data)}`);
  if (typeof data.ragicId !== "number") {
    throw new Error(`Ragic 新增成功但回應缺少 ragicId: ${JSON.stringify(data)}`);
  }
  return data.ragicId;
}

export async function finUpdate(sheet: FinanceSheet, recordId: number | string, fields: WriteFields): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toForm(fields),
  });
  if (!res.ok) throw new Error(`Ragic 更新失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { status?: string; msg?: string };
  if (data.status === "ERROR") throw new Error(`Ragic 更新失敗: ${data.msg ?? JSON.stringify(data)}`);
}

export async function finDelete(sheet: FinanceSheet, recordId: number | string): Promise<void> {
  const res = await fetch(buildUrl(sheet, recordId), { method: "DELETE" });
  if (!res.ok) throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
}

export function isRecordId(v: string): boolean {
  return /^\d+$/.test(v);
}

// where 條件：欄位編號 + 運算子 + 值（值要 URL 編碼）
export function whereClause(fieldId: number, op: "eq" | "like", value: string): string {
  return `where=${fieldId},${op},${encodeURIComponent(value)}`;
}
