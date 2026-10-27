// 財務模組的 Ragic 讀寫包裝。接在帳號根網址（QUOTATION_RAGIC_BASE_URL，例：https://ap15.ragic.com/qsprint）
// 底下的 /personal-finance-module/N，共用 RAGIC_API_KEY；只給 /api/finance/* 使用，
// 不 import、也不影響其他模組的 Ragic client。
//
// 讀寫不對稱：GET 回應用中文欄位名當 key；寫入一律用數字欄位編號（見 ragicFields.ts）。
// ⚠️ record id 0 是有效值（每張表第一筆就是 0），所有判斷都用 typeof／正規表示式，不可用 falsy。

import { AsyncLocalStorage } from "node:async_hooks";
import { FINANCE_SHEETS, type FinanceSheet } from "./ragicFields";
import { timedFetch } from "../ragic/timedFetch";

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

// ── 讀取快取 ────────────────────────────────────────────────
// 一個畫面會同時打好幾支 API，每支又要讀多張表；不節制的話很快就會被 Ragic 判定為異常請求而封鎖 IP。
// 所以讀取結果在記憶體裡短暫快取（TTL 很短），同一時間相同的讀取只送一次；
// 任何寫入都會清掉該張表的快取。會「寫入」的流程（POST／PATCH／DELETE、每日引擎）一律用 withFresh
// 包起來繞過快取，確保驗證、來源鍵防重複、流水號都是讀到最新資料。
const READ_TTL_MS = 20_000;
const readCache = new Map<string, { at: number; promise: Promise<FinanceRow[]> }>();
const freshScope = new AsyncLocalStorage<boolean>();

export function withFresh<T>(fn: () => Promise<T>): Promise<T> {
  return freshScope.run(true, fn);
}

function invalidate(sheet: FinanceSheet): void {
  const prefix = `${sheet}|`;
  for (const k of readCache.keys()) if (k.startsWith(prefix)) readCache.delete(k);
}

async function fetchList(sheet: FinanceSheet, extraQuery?: string): Promise<FinanceRow[]> {
  const res = await timedFetch(buildUrl(sheet, undefined, `limit=10000&subtables=0${extraQuery ? `&${extraQuery}` : ""}`), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Ragic 查詢失敗: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, FinanceRecord>;
  return Object.entries(data)
    .map(([id, rec]) => ({ id, rec }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// 查整張表（或帶 where 條件），回傳依紀錄編號排序的陣列。Ragic 回傳的 key 是紀錄編號字串。
export function finList(sheet: FinanceSheet, extraQuery?: string): Promise<FinanceRow[]> {
  if (freshScope.getStore()) return fetchList(sheet, extraQuery);
  const key = `${sheet}|${extraQuery ?? ""}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.promise;
  const promise = fetchList(sheet, extraQuery);
  readCache.set(key, { at: Date.now(), promise });
  // 失敗的結果不要留在快取裡
  promise.catch(() => readCache.delete(key));
  return promise;
}

// 新增一筆，回傳 Ragic 配發的紀錄編號（可能是 0）
export async function finCreate(sheet: FinanceSheet, fields: WriteFields): Promise<number> {
  const res = await timedFetch(buildUrl(sheet), {
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
  invalidate(sheet);
  return data.ragicId;
}

export async function finUpdate(sheet: FinanceSheet, recordId: number | string, fields: WriteFields): Promise<void> {
  const res = await timedFetch(buildUrl(sheet, recordId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toForm(fields),
  });
  if (!res.ok) throw new Error(`Ragic 更新失敗: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { status?: string; msg?: string };
  if (data.status === "ERROR") throw new Error(`Ragic 更新失敗: ${data.msg ?? JSON.stringify(data)}`);
  invalidate(sheet);
}

export async function finDelete(sheet: FinanceSheet, recordId: number | string): Promise<void> {
  const res = await timedFetch(buildUrl(sheet, recordId), { method: "DELETE" });
  if (!res.ok) throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
  invalidate(sheet);
}

export function isRecordId(v: string): boolean {
  return /^\d+$/.test(v);
}

// where 條件：欄位編號 + 運算子 + 值（值要 URL 編碼）
export function whereClause(fieldId: number, op: "eq" | "like", value: string): string {
  return `where=${fieldId},${op},${encodeURIComponent(value)}`;
}
