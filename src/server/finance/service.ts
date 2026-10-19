// 財務模組業務邏輯：驗證、自動欄位、寫入。路由只負責收發 HTTP，規則全部在這裡。
// 驗證失敗丟 FinanceError（400／403／404 + 中文訊息），路由統一轉成回應。

import type { AccountItem, CategoryItem, SeedResult, TransactionItem } from "@/lib/financeTypes";
import { DATE_RE, str } from "@/server/modules/dates";
import { isRealDate, nextMonth, nowTaipeiStamp } from "./dateUtil";
import { finCreate, finDelete, finList, finUpdate, isRecordId, whereClause, type WriteFields } from "./ragic";
import {
  ACCOUNT_TYPE,
  CATEGORY_KIND,
  F1,
  F2,
  F3,
  CHECK_OFF,
  CHECK_ON,
  TX_SOURCE,
  TX_STATUS,
  TX_TYPE,
  type TxType,
} from "./ragicFields";
import { listAccounts, listCardClosingDays, listCategories, listTransactions, toTransaction } from "./repo";

export class FinanceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

export function fail(message: string, status: 400 | 403 | 404 = 400): never {
  throw new FinanceError(message, status);
}

export const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const isOneOf = <T extends string>(set: Record<string, T>, v: string): v is T => Object.values(set).includes(v as T);

// ── 分類 ──────────────────────────────────────────────────────

export interface CategoryBody {
  name?: unknown;
  kind?: unknown;
  color?: unknown;
  order?: unknown;
  active?: unknown;
}

export function parseOrder(v: unknown, label = "排序"): number {
  const n = typeof v === "number" ? v : Number(str(v));
  if (!Number.isFinite(n) || !Number.isInteger(n)) fail(`${label}必須是整數`);
  return n;
}

export async function createCategory(body: CategoryBody): Promise<number> {
  const name = str(body.name).trim();
  const kind = str(body.kind);
  if (!name) fail("請輸入分類名稱");
  if (!isOneOf(CATEGORY_KIND, kind)) fail("收支別必須是收入或支出");

  const existing = await listCategories();
  if (existing.some((c) => c.name === name)) fail(`分類「${name}」已存在`);
  const order = has(body, "order") && str(body.order) !== "" ? parseOrder(body.order) : Math.max(0, ...existing.map((c) => c.order)) + 10;

  return finCreate("F2_CATEGORY", {
    [F2.分類名稱]: name,
    [F2.收支別]: kind,
    [F2.顏色]: str(body.color),
    [F2.排序]: order,
    [F2.啟用]: body.active === false ? CHECK_OFF : CHECK_ON,
  });
}

export async function updateCategory(recordId: string, body: CategoryBody): Promise<void> {
  const all = await listCategories();
  const current = all.find((c) => c.id === recordId);
  if (!current) fail("找不到這個分類", 404);

  const fields: WriteFields = {};
  if (has(body, "name")) {
    const name = str(body.name).trim();
    if (!name) fail("請輸入分類名稱");
    if (name !== current.name) {
      if (all.some((c) => c.id !== recordId && c.name === name)) fail(`分類「${name}」已存在`);
      // 明細的「分類」欄存的是分類名稱，改名會讓舊明細對不上
      const used = await finList("F3_TRANSACTION", whereClause(F3.分類, "eq", current.name));
      if (used.length > 0) fail("已有明細使用這個分類，不能改名；請停用它並新增新分類");
      fields[F2.分類名稱] = name;
    }
  }
  if (has(body, "kind")) {
    const kind = str(body.kind);
    if (!isOneOf(CATEGORY_KIND, kind)) fail("收支別必須是收入或支出");
    if (kind !== current.kind) {
      const used = await finList("F3_TRANSACTION", whereClause(F3.分類, "eq", current.name));
      if (used.length > 0) fail("已有明細使用這個分類，不能改收支別");
      fields[F2.收支別] = kind;
    }
  }
  if (has(body, "color")) fields[F2.顏色] = str(body.color);
  if (has(body, "order")) fields[F2.排序] = parseOrder(body.order);
  if (has(body, "active")) fields[F2.啟用] = body.active ? CHECK_ON : CHECK_OFF;

  if (Object.keys(fields).length > 0) await finUpdate("F2_CATEGORY", recordId, fields);
}

// 預設分類。收入、支出各有一個「其他」，名稱分開避免同名衝突。排序 10、20、30…
const SEED_CATEGORIES: { name: string; kind: CategoryItem["kind"] }[] = [
  ...["薪資", "接案", "獎金", "退款", "其他收入"].map((name) => ({ name, kind: CATEGORY_KIND.收入 })),
  ...["餐飲", "交通", "居住", "通訊", "器材", "保險", "貸款還款", "手續費利息", "醫療", "娛樂", "其他支出"].map((name) => ({
    name,
    kind: CATEGORY_KIND.支出,
  })),
];

export async function seedCategories(dryRun: boolean): Promise<SeedResult> {
  const existing = new Set((await listCategories()).map((c) => c.name));
  const toCreate: SeedResult["toCreate"] = [];
  const skipped: SeedResult["skipped"] = [];

  for (const [i, cat] of SEED_CATEGORIES.entries()) {
    if (existing.has(cat.name)) {
      skipped.push(cat);
      continue;
    }
    toCreate.push(cat);
    if (!dryRun) {
      await finCreate("F2_CATEGORY", {
        [F2.分類名稱]: cat.name,
        [F2.收支別]: cat.kind,
        [F2.排序]: (i + 1) * 10,
        [F2.啟用]: CHECK_ON,
      });
    }
  }
  return { success: true, dryRun, toCreate, skipped };
}

// ── 帳戶 ──────────────────────────────────────────────────────

export interface AccountBody {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  institution?: unknown;
  last4?: unknown;
  openingBalance?: unknown;
  openingDate?: unknown;
  isDefault?: unknown;
  active?: unknown;
  order?: unknown;
  note?: unknown;
}

function parseLast4(v: unknown): string {
  const s = str(v).trim();
  if (s !== "" && !/^\d{4}$/.test(s)) fail("末四碼必須是 4 位數字");
  return s;
}

export function parseMoney(v: unknown, label: string): number {
  const n = typeof v === "number" ? v : Number(str(v).trim());
  if (str(v).trim() === "" || !Number.isFinite(n)) fail(`${label}必須是數字`);
  return n;
}

export function parseDate(v: unknown, label: string): string {
  const s = str(v).trim();
  if (!DATE_RE.test(s) || !isRealDate(s)) fail(`${label}格式錯誤，須為 yyyy-MM-dd`);
  return s;
}

// 預設記帳限一個：把其他帳戶的「預設記帳」改成否
async function clearOtherDefaults(keepId: string): Promise<void> {
  const all = await listAccounts();
  for (const acc of all) {
    if (acc.id !== keepId && acc.isDefault) await finUpdate("F1_ACCOUNT", acc.id, { [F1.預設記帳]: CHECK_OFF });
  }
}

export async function createAccount(body: AccountBody): Promise<number> {
  const code = str(body.code).trim();
  const name = str(body.name).trim();
  const type = str(body.type);
  if (!code) fail("請輸入帳戶編號");
  if (!name) fail("請輸入帳戶名稱");
  if (!isOneOf(ACCOUNT_TYPE, type)) fail("帳戶類型必須是銀行、現金、電子支付或信用卡");
  const last4 = parseLast4(body.last4);
  const openingBalance = parseMoney(has(body, "openingBalance") ? body.openingBalance : 0, "期初餘額");
  const openingDate = parseDate(body.openingDate, "期初日期");

  const existing = await listAccounts();
  if (existing.some((a) => a.code === code)) fail(`帳戶編號「${code}」已存在`);
  const order = has(body, "order") && str(body.order) !== "" ? parseOrder(body.order) : Math.max(0, ...existing.map((a) => a.order)) + 10;

  const id = await finCreate("F1_ACCOUNT", {
    [F1.帳戶編號]: code,
    [F1.帳戶名稱]: name,
    [F1.帳戶類型]: type,
    [F1.機構]: str(body.institution).trim(),
    [F1.末四碼]: last4,
    [F1.期初餘額]: openingBalance,
    [F1.期初日期]: openingDate,
    [F1.預設記帳]: body.isDefault ? CHECK_ON : CHECK_OFF,
    [F1.啟用]: body.active === false ? CHECK_OFF : CHECK_ON,
    [F1.排序]: order,
    [F1.備註]: str(body.note),
  });
  if (body.isDefault) await clearOtherDefaults(String(id));
  return id;
}

export async function updateAccount(recordId: string, body: AccountBody): Promise<void> {
  const current = (await listAccounts()).find((a) => a.id === recordId);
  if (!current) fail("找不到這個帳戶", 404);
  // 明細用帳戶編號關聯，編號一改舊明細就對不上
  if (has(body, "code") && str(body.code).trim() !== current.code) fail("帳戶編號建立後不能修改");

  const fields: WriteFields = {};
  if (has(body, "name")) {
    const name = str(body.name).trim();
    if (!name) fail("請輸入帳戶名稱");
    fields[F1.帳戶名稱] = name;
  }
  if (has(body, "type")) {
    const type = str(body.type);
    if (!isOneOf(ACCOUNT_TYPE, type)) fail("帳戶類型必須是銀行、現金、電子支付或信用卡");
    fields[F1.帳戶類型] = type;
  }
  if (has(body, "institution")) fields[F1.機構] = str(body.institution).trim();
  if (has(body, "last4")) fields[F1.末四碼] = parseLast4(body.last4);
  if (has(body, "openingBalance")) fields[F1.期初餘額] = parseMoney(body.openingBalance, "期初餘額");
  if (has(body, "openingDate")) fields[F1.期初日期] = parseDate(body.openingDate, "期初日期");
  if (has(body, "isDefault")) fields[F1.預設記帳] = body.isDefault ? CHECK_ON : CHECK_OFF;
  if (has(body, "active")) fields[F1.啟用] = body.active ? CHECK_ON : CHECK_OFF;
  if (has(body, "order")) fields[F1.排序] = parseOrder(body.order);
  if (has(body, "note")) fields[F1.備註] = str(body.note);

  if (Object.keys(fields).length > 0) await finUpdate("F1_ACCOUNT", recordId, fields);
  if (body.isDefault) await clearOtherDefaults(recordId);
}

// ── 收支明細 ──────────────────────────────────────────────────

export interface TransactionBody {
  date?: unknown;
  type?: unknown;
  amount?: unknown;
  account?: unknown;
  toAccount?: unknown;
  category?: unknown;
  summary?: unknown;
  note?: unknown;
}

export interface TxInput {
  date: string;
  type: TxType;
  amount: number;
  account: string;
  toAccount: string;
  category: string;
  summary: string;
  note: string;
}

// 合併（PATCH 時先帶入原值）後整筆驗證。accounts／categories 由呼叫端查好傳進來。
// previous：PATCH 時的原明細——帳戶、分類沒變就不重新檢查「是否啟用」，避免舊明細因為帳戶後來停用而改不了。
export function validateTx(
  input: TxInput,
  accounts: AccountItem[],
  categories: CategoryItem[],
  previous?: TransactionItem,
): void {
  if (!DATE_RE.test(input.date) || !isRealDate(input.date)) fail("日期格式錯誤，須為 yyyy-MM-dd");
  if (!isOneOf(TX_TYPE, input.type)) fail("類型必須是收入、支出或轉帳");
  if (!Number.isInteger(input.amount) || input.amount <= 0) fail("金額必須是大於 0 的整數");

  const checkAccount = (code: string, label: string, unchanged: boolean) => {
    if (!code) fail(`請選擇${label}`);
    const acc = accounts.find((a) => a.code === code);
    if (!acc) fail(`${label}「${code}」不存在`);
    if (!acc.active && !unchanged) fail(`${label}「${acc.name}」已停用`);
  };
  checkAccount(input.account, "帳戶", previous?.account === input.account);

  if (input.type === TX_TYPE.轉帳) {
    if (!input.toAccount) fail("轉帳必須選擇轉入帳戶");
    if (input.toAccount === input.account) fail("轉入帳戶不能和轉出帳戶相同");
    checkAccount(input.toAccount, "轉入帳戶", previous?.toAccount === input.toAccount);
    return;
  }

  // 收入／支出
  if (!input.category) fail("收入與支出必須選擇分類");
  const cat = categories.find((c) => c.name === input.category);
  if (!cat) fail(`分類「${input.category}」不存在`);
  if (cat.kind !== input.type) fail(`分類「${cat.name}」是${cat.kind}分類，不能用在${input.type}`);
  if (!cat.active && previous?.category !== input.category) fail(`分類「${cat.name}」已停用`);
}

// 帳單月份：只有信用卡帳戶才算。消費日 ≤ 結帳日 → 當月；> 結帳日 → 次月。查不到 F5 設定就留空。
async function computeBillMonth(accounts: AccountItem[], accountCode: string, date: string): Promise<string> {
  const acc = accounts.find((a) => a.code === accountCode);
  if (!acc || acc.type !== ACCOUNT_TYPE.信用卡) return "";
  const closingDay = (await listCardClosingDays()).get(accountCode);
  if (closingDay === undefined) return "";
  const month = date.slice(0, 7);
  return Number(date.slice(8, 10)) <= closingDay ? month : nextMonth(month);
}

// T-yyyyMMdd-nnnn：yyyyMMdd 是明細日期，nnnn 是該日已有編號的最大流水號 + 1
async function nextTxCode(date: string): Promise<string> {
  const prefix = `T-${date.replaceAll("-", "")}-`;
  const rows = await finList("F3_TRANSACTION", whereClause(F3.明細編號, "like", prefix));
  let max = 0;
  for (const r of rows) {
    const code = str(r.rec["明細編號" satisfies keyof typeof F3]);
    if (!code.startsWith(prefix)) continue;
    const n = Number(code.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function parseAmount(v: unknown): number {
  const s = str(v).trim();
  return s === "" ? NaN : Number(s);
}

export async function createTransaction(body: TransactionBody): Promise<{ id: number; code: string }> {
  const type = str(body.type) as TxType;
  const input: TxInput = {
    date: str(body.date).trim(),
    type,
    amount: parseAmount(body.amount),
    account: str(body.account).trim(),
    toAccount: type === TX_TYPE.轉帳 ? str(body.toAccount).trim() : "",
    category: type === TX_TYPE.轉帳 ? "" : str(body.category).trim(),
    summary: str(body.summary).trim(),
    note: str(body.note),
  };
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  validateTx(input, accounts, categories);

  const code = await nextTxCode(input.date);
  const billMonth = await computeBillMonth(accounts, input.account, input.date);
  const id = await finCreate("F3_TRANSACTION", {
    [F3.明細編號]: code,
    [F3.日期]: input.date,
    [F3.類型]: input.type,
    [F3.金額]: input.amount,
    [F3.帳戶]: input.account,
    [F3.轉入帳戶]: input.toAccount,
    [F3.分類]: input.category,
    [F3.摘要]: input.summary,
    [F3.狀態]: TX_STATUS.已入帳,
    [F3.來源]: TX_SOURCE.手動,
    [F3.來源鍵]: "",
    [F3.帳單月份]: billMonth,
    [F3.建立時間]: nowTaipeiStamp(),
    [F3.備註]: input.note,
  });
  return { id, code };
}

async function findTransaction(recordId: string): Promise<TransactionItem> {
  const rows = await finList("F3_TRANSACTION");
  const row = rows.find((r) => r.id === recordId);
  if (!row) fail("找不到這筆明細", 404);
  return toTransaction(row.id, row.rec);
}

export async function updateTransaction(recordId: string, body: TransactionBody): Promise<void> {
  const current = await findTransaction(recordId);
  const type = (has(body, "type") ? str(body.type) : current.type) as TxType;
  const input: TxInput = {
    date: has(body, "date") ? str(body.date).trim() : current.date,
    type,
    amount: has(body, "amount") ? parseAmount(body.amount) : current.amount,
    account: has(body, "account") ? str(body.account).trim() : current.account,
    toAccount: type === TX_TYPE.轉帳 ? (has(body, "toAccount") ? str(body.toAccount).trim() : current.toAccount) : "",
    category: type === TX_TYPE.轉帳 ? "" : has(body, "category") ? str(body.category).trim() : current.category,
    summary: has(body, "summary") ? str(body.summary).trim() : current.summary,
    note: has(body, "note") ? str(body.note) : current.note,
  };
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  validateTx(input, accounts, categories, current);

  // 來源、來源鍵、狀態、建立時間、明細編號都不由使用者修改；帳單月份依新日期／帳戶重算
  const billMonth = await computeBillMonth(accounts, input.account, input.date);
  await finUpdate("F3_TRANSACTION", recordId, {
    [F3.日期]: input.date,
    [F3.類型]: input.type,
    [F3.金額]: input.amount,
    [F3.帳戶]: input.account,
    [F3.轉入帳戶]: input.toAccount,
    [F3.分類]: input.category,
    [F3.摘要]: input.summary,
    [F3.帳單月份]: billMonth,
    [F3.備註]: input.note,
  });
}

// 只有來源＝手動的明細能刪；定期／分期／貸款／保險／卡費產生的明細回 403
export async function deleteTransaction(recordId: string): Promise<void> {
  const current = await findTransaction(recordId);
  if (current.source !== TX_SOURCE.手動) fail(`來源為「${current.source}」的明細不能刪除，只有手動新增的才能刪`, 403);
  await finDelete("F3_TRANSACTION", recordId);
}

export { isRecordId, listAccounts, listCategories, listTransactions };

// 預定 → 已入帳（排程產生的「預定」明細，確認後才計入餘額）
export async function confirmTransaction(recordId: string): Promise<void> {
  const current = await findTransaction(recordId);
  if (current.status === TX_STATUS.已入帳) fail("這筆明細已經是已入帳");
  await finUpdate("F3_TRANSACTION", recordId, { [F3.狀態]: TX_STATUS.已入帳 });
}
