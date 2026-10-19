// 財務模組資料讀取：把 Ragic 的中文 key 紀錄轉成前後端共用的型別。
// 數字欄位 GET 回來是字串，這裡統一轉數字；日期統一轉 yyyy-MM-dd。

import type {
  AccountItem,
  AccountType,
  CategoryItem,
  CategoryKind,
  TransactionItem,
  TxSource,
  TxStatus,
  TxType,
} from "@/lib/financeTypes";
import { str } from "@/server/modules/dates";
import { normalizeRagicDate } from "./dateUtil";
import { finList, type FinanceRecord } from "./ragic";
import { F1, F2, F3, F5, isYes } from "./ragicFields";

function num(v: unknown): number {
  const n = Number(str(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : 0;
}

// 用 F1／F2／F3 的 key 型別限制只能讀 05 盤點表裡有的欄位名稱
const a = (rec: FinanceRecord, k: keyof typeof F1) => str(rec[k]);
const c = (rec: FinanceRecord, k: keyof typeof F2) => str(rec[k]);
const t = (rec: FinanceRecord, k: keyof typeof F3) => str(rec[k]);

export function toAccount(id: string, rec: FinanceRecord): AccountItem {
  return {
    id,
    code: a(rec, "帳戶編號"),
    name: a(rec, "帳戶名稱"),
    type: a(rec, "帳戶類型") as AccountType,
    institution: a(rec, "機構"),
    last4: a(rec, "末四碼"),
    openingBalance: num(rec["期初餘額" satisfies keyof typeof F1]),
    openingDate: normalizeRagicDate(rec["期初日期" satisfies keyof typeof F1]),
    isDefault: isYes(rec["預設記帳" satisfies keyof typeof F1]),
    active: isYes(rec["啟用" satisfies keyof typeof F1]),
    order: num(rec["排序" satisfies keyof typeof F1]),
    note: a(rec, "備註"),
  };
}

export function toCategory(id: string, rec: FinanceRecord): CategoryItem {
  return {
    id,
    name: c(rec, "分類名稱"),
    kind: c(rec, "收支別") as CategoryKind,
    color: c(rec, "顏色"),
    order: num(rec["排序" satisfies keyof typeof F2]),
    active: isYes(rec["啟用" satisfies keyof typeof F2]),
  };
}

export function toTransaction(id: string, rec: FinanceRecord): TransactionItem {
  return {
    id,
    code: t(rec, "明細編號"),
    date: normalizeRagicDate(rec["日期" satisfies keyof typeof F3]),
    type: t(rec, "類型") as TxType,
    amount: num(rec["金額" satisfies keyof typeof F3]),
    account: t(rec, "帳戶"),
    toAccount: t(rec, "轉入帳戶"),
    category: t(rec, "分類"),
    summary: t(rec, "摘要"),
    status: t(rec, "狀態") as TxStatus,
    source: t(rec, "來源") as TxSource,
    sourceKey: t(rec, "來源鍵"),
    billMonth: t(rec, "帳單月份"),
    createdAt: t(rec, "建立時間"),
    note: t(rec, "備註"),
  };
}

function byOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((x, y) => x.order - y.order);
}

export async function listAccounts(): Promise<AccountItem[]> {
  const rows = await finList("F1_ACCOUNT");
  return byOrder(rows.map((r) => toAccount(r.id, r.rec)));
}

export async function listCategories(): Promise<CategoryItem[]> {
  const rows = await finList("F2_CATEGORY");
  return byOrder(rows.map((r) => toCategory(r.id, r.rec)));
}

export async function listTransactions(extraQuery?: string): Promise<TransactionItem[]> {
  const rows = await finList("F3_TRANSACTION", extraQuery);
  return rows.map((r) => toTransaction(r.id, r.rec));
}

// 信用卡設定：帳戶編號 → 結帳日（查不到就沒有 key）
export async function listCardClosingDays(): Promise<Map<string, number>> {
  const rows = await finList("F5_CARD");
  const map = new Map<string, number>();
  for (const r of rows) {
    const code = str(r.rec["帳戶編號" satisfies keyof typeof F5]);
    const day = num(r.rec["結帳日" satisfies keyof typeof F5]);
    if (code && day >= 1 && day <= 31) map.set(code, day);
  }
  return map;
}
