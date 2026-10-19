// F2 之後積木的資料讀寫：定期規則、信用卡設定／帳單、分期、貸款（含利率異動）、保險、財務設定。
// 讀取統一轉成前後端共用型別（數字轉 number、日期轉 yyyy-MM-dd）；寫入用數字欄位編號。
// 自動產生編號：規則 R-001、分期 I-001、貸款 L-001、保單 P-001（不讓使用者手打，避免重複）。

import type {
  CardSetting,
  FinanceSettings,
  InstallmentItem,
  LoanItem,
  PolicyItem,
  RateChangeItem,
  RuleItem,
  StatementItem,
  TxType,
} from "@/lib/financeTypes";
import { DATE_RE, MONTH_RE, str } from "@/server/modules/dates";
import { isRealDate, normalizeRagicDate } from "./dateUtil";
import { splitInstallment } from "./installment";
import { finCreate, finList, finUpdate, type FinanceRecord, type WriteFields } from "./ragic";
import {
  ACCOUNT_TYPE,
  DEBIT_MODE,
  F10,
  F4,
  F5,
  F6,
  F7,
  F8,
  F8B,
  F9,
  INS_FREQ,
  INS_KIND,
  INS_PAY_MODE,
  INS_STATUS,
  INST_STATUS,
  LOAN_STATUS,
  LOAN_TYPE,
  CHECK_OFF,
  CHECK_ON,
  NO,
  RATE_TYPE,
  REMAINDER_MODE,
  REPAY_MODE,
  RULE_FREQ,
  STMT_STATUS,
  TX_TYPE,
  YES,
  isYes,
} from "./ragicFields";
import { fail, has, isOneOf, listAccounts, listCategories, validateTx } from "./service";

// ── 小工具 ────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = Number(str(v).replaceAll(",", ""));
  return Number.isFinite(n) ? n : 0;
}
// 空白＝尚未填寫（和填 0 不同），用在「銀行帳單金額」這類有值時才覆蓋的欄位
function numOrNull(v: unknown): number | null {
  const s = str(v).trim().replaceAll(",", "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const s = str(v).trim();
  const n = Number(s);
  if (s === "" || !Number.isInteger(n) || n < min || n > max) fail(`${label}必須是 ${min}${max === Number.MAX_SAFE_INTEGER ? " 以上" : `～${max}`} 的整數`);
  return n;
}
function optionalDate(v: unknown, label: string): string {
  const s = str(v).trim();
  if (s === "") return "";
  if (!DATE_RE.test(s) || !isRealDate(s)) fail(`${label}格式錯誤，須為 yyyy-MM-dd`);
  return s;
}
function requiredDate(v: unknown, label: string): string {
  if (str(v).trim() === "") fail(`請填寫${label}`);
  return optionalDate(v, label);
}
const yn = (b: unknown) => (b ? YES : NO);
const chk = (b: unknown) => (b ? CHECK_ON : CHECK_OFF);

async function nextCode(sheet: "F4_RECURRING" | "F7_INSTALLMENT" | "F8_LOAN" | "F9_INSURANCE", field: number, prefix: string): Promise<string> {
  const rows = await finList(sheet);
  let max = 0;
  for (const r of rows) {
    const code = str(r.rec[Object.entries(sheetKeys[sheet]).find(([, id]) => id === field)![0]]);
    const m = code.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
const sheetKeys = { F4_RECURRING: F4, F7_INSTALLMENT: F7, F8_LOAN: F8, F9_INSURANCE: F9 } as const;

// ── 定期規則（F4）─────────────────────────────────────────────

const r4 = (rec: FinanceRecord, k: keyof typeof F4) => str(rec[k]);

export function toRule(id: string, rec: FinanceRecord): RuleItem {
  return {
    id,
    code: r4(rec, "規則編號"),
    name: r4(rec, "名稱"),
    type: r4(rec, "類型") as TxType,
    amount: num(rec["金額" satisfies keyof typeof F4]),
    account: r4(rec, "帳戶"),
    toAccount: r4(rec, "轉入帳戶"),
    category: r4(rec, "分類"),
    freq: r4(rec, "頻率"),
    intervalN: num(rec["間隔N" satisfies keyof typeof F4]),
    day: num(rec["執行日" satisfies keyof typeof F4]),
    start: normalizeRagicDate(rec["開始日" satisfies keyof typeof F4]),
    end: normalizeRagicDate(rec["結束日" satisfies keyof typeof F4]),
    autoPost: isYes(rec["自動入帳" satisfies keyof typeof F4]),
    active: isYes(rec["啟用" satisfies keyof typeof F4]),
  };
}

export async function listRules(): Promise<RuleItem[]> {
  return (await finList("F4_RECURRING")).map((r) => toRule(r.id, r.rec));
}

export interface RuleBody {
  name?: unknown;
  type?: unknown;
  amount?: unknown;
  account?: unknown;
  toAccount?: unknown;
  category?: unknown;
  freq?: unknown;
  intervalN?: unknown;
  day?: unknown;
  start?: unknown;
  end?: unknown;
  autoPost?: unknown;
  active?: unknown;
}

async function ruleFromBody(body: RuleBody, base?: RuleItem): Promise<Omit<RuleItem, "id" | "code">> {
  const pick = <K extends keyof RuleBody>(k: K, fallback: unknown) => (has(body, k) ? body[k] : fallback);
  const type = str(pick("type", base?.type)) as TxType;
  const freq = str(pick("freq", base?.freq));
  if (!isOneOf(RULE_FREQ, freq)) fail("頻率必須是每月、每週、每年或每N月");
  const dayMax = freq === RULE_FREQ.每週 ? 7 : 31;
  const rule = {
    name: str(pick("name", base?.name)).trim(),
    type,
    amount: Number(str(pick("amount", base?.amount)).trim()),
    account: str(pick("account", base?.account)).trim(),
    toAccount: type === TX_TYPE.轉帳 ? str(pick("toAccount", base?.toAccount)).trim() : "",
    category: type === TX_TYPE.轉帳 ? "" : str(pick("category", base?.category)).trim(),
    freq,
    intervalN: int(pick("intervalN", base?.intervalN ?? 1), "間隔", 1, 120),
    day: int(pick("day", base?.day), freq === RULE_FREQ.每週 ? "執行日（星期幾，1=週一…7=週日）" : "執行日", 1, dayMax),
    start: requiredDate(pick("start", base?.start), "開始日"),
    end: optionalDate(pick("end", base?.end), "結束日"),
    autoPost: Boolean(pick("autoPost", base?.autoPost ?? false)),
    active: pick("active", base?.active ?? true) !== false,
  };
  if (!rule.name) fail("請輸入規則名稱");
  if (rule.end && rule.end < rule.start) fail("結束日不能早於開始日");
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  // 規則的欄位組合和手動明細的規則一致：金額正整數、轉帳要轉入帳戶、收支要對應分類
  validateTx(
    {
      date: rule.start,
      type: rule.type,
      amount: rule.amount,
      account: rule.account,
      toAccount: rule.toAccount,
      category: rule.category,
      summary: rule.name,
      note: "",
    },
    accounts,
    categories,
    base && {
      id: base.id,
      code: base.code,
      date: base.start,
      type: base.type,
      amount: base.amount,
      account: base.account,
      toAccount: base.toAccount,
      category: base.category,
      summary: base.name,
      status: "預定",
      source: "定期",
      sourceKey: "",
      billMonth: "",
      createdAt: "",
      note: "",
    },
  );
  return rule;
}

function ruleFields(code: string | null, r: Omit<RuleItem, "id" | "code">): WriteFields {
  const f: WriteFields = {
    [F4.名稱]: r.name,
    [F4.類型]: r.type,
    [F4.金額]: r.amount,
    [F4.帳戶]: r.account,
    [F4.轉入帳戶]: r.toAccount,
    [F4.分類]: r.category,
    [F4.頻率]: r.freq,
    [F4.間隔N]: r.intervalN,
    [F4.執行日]: r.day,
    [F4.開始日]: r.start,
    [F4.結束日]: r.end,
    [F4.自動入帳]: yn(r.autoPost),
    [F4.啟用]: chk(r.active),
  };
  if (code) f[F4.規則編號] = code;
  return f;
}

export async function createRule(body: RuleBody): Promise<number> {
  const rule = await ruleFromBody(body);
  return finCreate("F4_RECURRING", ruleFields(await nextCode("F4_RECURRING", F4.規則編號, "R"), rule));
}

export async function updateRule(recordId: string, body: RuleBody): Promise<void> {
  const base = (await listRules()).find((r) => r.id === recordId);
  if (!base) fail("找不到這條規則", 404);
  await finUpdate("F4_RECURRING", recordId, ruleFields(null, await ruleFromBody(body, base)));
}

// ── 信用卡設定（F5）───────────────────────────────────────────

const r5 = (rec: FinanceRecord, k: keyof typeof F5) => str(rec[k]);

export function toCardSetting(id: string, rec: FinanceRecord): CardSetting {
  return {
    id,
    account: r5(rec, "帳戶編號"),
    closingDay: num(rec["結帳日" satisfies keyof typeof F5]),
    dueDay: num(rec["繳款截止日" satisfies keyof typeof F5]),
    limit: num(rec["信用額度" satisfies keyof typeof F5]),
    autoDebitAccount: r5(rec, "自動扣繳帳戶"),
    debitMode: r5(rec, "扣繳方式"),
  };
}

export async function listCardSettings(): Promise<CardSetting[]> {
  return (await finList("F5_CARD")).map((r) => toCardSetting(r.id, r.rec));
}

export interface CardSettingBody {
  account?: unknown;
  closingDay?: unknown;
  dueDay?: unknown;
  limit?: unknown;
  autoDebitAccount?: unknown;
  debitMode?: unknown;
}

async function cardFromBody(body: CardSettingBody, base?: CardSetting): Promise<Omit<CardSetting, "id">> {
  const pick = <K extends keyof CardSettingBody>(k: K, fallback: unknown) => (has(body, k) ? body[k] : fallback);
  const account = str(pick("account", base?.account)).trim();
  const accounts = await listAccounts();
  const acc = accounts.find((a) => a.code === account);
  if (!acc) fail(`找不到帳戶「${account}」`);
  if (acc.type !== ACCOUNT_TYPE.信用卡) fail(`「${acc.name}」不是信用卡帳戶`);

  const debit = str(pick("autoDebitAccount", base?.autoDebitAccount)).trim();
  if (debit) {
    const d = accounts.find((a) => a.code === debit);
    if (!d || d.type === ACCOUNT_TYPE.信用卡) fail("自動扣繳帳戶必須是存在的非信用卡帳戶");
  }
  const mode = str(pick("debitMode", base?.debitMode || DEBIT_MODE.全額));
  if (!isOneOf(DEBIT_MODE, mode)) fail("扣繳方式必須是全額或最低");
  return {
    account,
    closingDay: int(pick("closingDay", base?.closingDay), "結帳日", 1, 31),
    dueDay: int(pick("dueDay", base?.dueDay), "繳款截止日", 1, 31),
    limit: int(pick("limit", base?.limit ?? 0), "信用額度", 0),
    autoDebitAccount: debit,
    debitMode: mode,
  };
}

function cardFields(c: Omit<CardSetting, "id">): WriteFields {
  return {
    [F5.帳戶編號]: c.account,
    [F5.結帳日]: c.closingDay,
    [F5.繳款截止日]: c.dueDay,
    [F5.信用額度]: c.limit,
    [F5.自動扣繳帳戶]: c.autoDebitAccount,
    [F5.扣繳方式]: c.debitMode,
  };
}

export async function saveCardSetting(body: CardSettingBody): Promise<{ id: number | string }> {
  const existing = await listCardSettings();
  const card = await cardFromBody(body, existing.find((c) => c.account === str(body.account).trim()));
  const current = existing.find((c) => c.account === card.account);
  if (current) {
    await finUpdate("F5_CARD", current.id, cardFields(card));
    return { id: current.id };
  }
  return { id: await finCreate("F5_CARD", cardFields(card)) };
}

// ── 信用卡帳單（F6）───────────────────────────────────────────

const r6 = (rec: FinanceRecord, k: keyof typeof F6) => str(rec[k]);

export function toStatement(id: string, rec: FinanceRecord): StatementItem {
  const system = num(rec["系統試算金額" satisfies keyof typeof F6]);
  const bank = numOrNull(rec["銀行帳單金額" satisfies keyof typeof F6]);
  return {
    id,
    code: r6(rec, "帳單編號"),
    card: r6(rec, "卡片"),
    month: r6(rec, "帳單月份"),
    closingDate: normalizeRagicDate(rec["結帳日" satisfies keyof typeof F6]),
    dueDate: normalizeRagicDate(rec["繳款截止日" satisfies keyof typeof F6]),
    systemAmount: system,
    bankAmount: bank,
    minDue: numOrNull(rec["最低應繳" satisfies keyof typeof F6]),
    paid: num(rec["已繳金額" satisfies keyof typeof F6]),
    paidDate: normalizeRagicDate(rec["繳款日" satisfies keyof typeof F6]),
    status: r6(rec, "狀態"),
    payable: bank ?? system,
    diff: bank === null ? null : bank - system,
  };
}

export async function listStatements(): Promise<StatementItem[]> {
  const list = (await finList("F6_STATEMENT")).map((r) => toStatement(r.id, r.rec));
  return list.sort((a, b) => b.month.localeCompare(a.month) || a.card.localeCompare(b.card));
}

export async function createStatement(s: {
  code: string;
  card: string;
  month: string;
  closingDate: string;
  dueDate: string;
  systemAmount: number;
}): Promise<number> {
  return finCreate("F6_STATEMENT", {
    [F6.帳單編號]: s.code,
    [F6.卡片]: s.card,
    [F6.帳單月份]: s.month,
    [F6.結帳日]: s.closingDate,
    [F6.繳款截止日]: s.dueDate,
    [F6.系統試算金額]: s.systemAmount,
    [F6.已繳金額]: 0,
    [F6.狀態]: STMT_STATUS.待繳,
  });
}

export interface StatementBody {
  bankAmount?: unknown;
  minDue?: unknown;
}

// 手填：銀行帳單金額、最低應繳（空字串＝清除）。對帳差額由前端／讀取時計算，不寫回。
export async function updateStatement(recordId: string, body: StatementBody): Promise<void> {
  const current = (await listStatements()).find((s) => s.id === recordId);
  if (!current) fail("找不到這張帳單", 404);
  const fields: WriteFields = {};
  const money = (v: unknown, label: string): string | number => {
    if (str(v).trim() === "") return "";
    const n = Number(str(v).trim());
    if (!Number.isInteger(n) || n < 0) fail(`${label}必須是 0 以上的整數`);
    return n;
  };
  if (has(body, "bankAmount")) fields[F6.銀行帳單金額] = money(body.bankAmount, "銀行帳單金額");
  if (has(body, "minDue")) fields[F6.最低應繳] = money(body.minDue, "最低應繳");
  if (Object.keys(fields).length === 0) return;
  await finUpdate("F6_STATEMENT", recordId, fields);
}

// 依已繳金額與應繳金額重算狀態（逾期的判斷在每日排程）
export function statementStatus(payable: number, paid: number, current: string): string {
  if (payable <= 0 || paid >= payable) return STMT_STATUS.已繳;
  if (paid > 0) return STMT_STATUS.部分繳;
  return current === STMT_STATUS.逾期 ? STMT_STATUS.逾期 : STMT_STATUS.待繳;
}

export async function writeStatementPayment(recordId: string, paid: number, paidDate: string, status: string): Promise<void> {
  await finUpdate("F6_STATEMENT", recordId, {
    [F6.已繳金額]: paid,
    [F6.繳款日]: paidDate,
    [F6.狀態]: status,
  });
}

export async function writeStatementStatus(recordId: string, status: string): Promise<void> {
  await finUpdate("F6_STATEMENT", recordId, { [F6.狀態]: status });
}

export async function writeStatementSystemAmount(recordId: string, amount: number): Promise<void> {
  await finUpdate("F6_STATEMENT", recordId, { [F6.系統試算金額]: amount });
}

// ── 信用卡分期（F7）───────────────────────────────────────────

const r7 = (rec: FinanceRecord, k: keyof typeof F7) => str(rec[k]);

export function toInstallmentBase(id: string, rec: FinanceRecord): Omit<InstallmentItem, "amounts" | "posted" | "remaining"> {
  return {
    id,
    code: r7(rec, "分期編號"),
    card: r7(rec, "卡片"),
    item: r7(rec, "品項"),
    category: r7(rec, "分類"),
    purchaseDate: normalizeRagicDate(rec["消費日" satisfies keyof typeof F7]),
    total: num(rec["總金額" satisfies keyof typeof F7]),
    periods: num(rec["期數" satisfies keyof typeof F7]),
    firstBillMonth: r7(rec, "首期帳單月份"),
    remainderAt: r7(rec, "尾差處理") || REMAINDER_MODE.首期,
    fee: num(rec["手續費總額" satisfies keyof typeof F7]),
    status: r7(rec, "狀態"),
    earlyDate: normalizeRagicDate(rec["提前清償日" satisfies keyof typeof F7]),
    note: r7(rec, "備註"),
  };
}

export function withInstallmentCalc(
  base: Omit<InstallmentItem, "amounts" | "posted" | "remaining">,
  postedKeys: Set<string>,
): InstallmentItem {
  const amounts = splitInstallment(base.total, base.periods, base.fee, base.remainderAt !== REMAINDER_MODE.末期);
  let posted = 0;
  let paid = 0;
  amounts.forEach((a, i) => {
    if (postedKeys.has(`INST-${base.code}-${i + 1}`)) {
      posted++;
      paid += a;
    }
  });
  return { ...base, amounts, posted, remaining: base.total + base.fee - paid };
}

export async function listInstallmentBases() {
  return (await finList("F7_INSTALLMENT")).map((r) => toInstallmentBase(r.id, r.rec));
}

export interface InstallmentBody {
  card?: unknown;
  item?: unknown;
  category?: unknown;
  purchaseDate?: unknown;
  total?: unknown;
  periods?: unknown;
  firstBillMonth?: unknown;
  remainderAt?: unknown;
  fee?: unknown;
  status?: unknown;
  earlyDate?: unknown;
  note?: unknown;
}

export async function createInstallment(body: InstallmentBody, defaultFirstBillMonth: (card: string, date: string) => Promise<string>): Promise<number> {
  const card = str(body.card).trim();
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const acc = accounts.find((a) => a.code === card);
  if (!acc || acc.type !== ACCOUNT_TYPE.信用卡) fail("請選擇存在的信用卡帳戶");
  const item = str(body.item).trim();
  if (!item) fail("請輸入品項");
  const category = str(body.category).trim();
  const cat = categories.find((c) => c.name === category);
  if (!cat || cat.kind !== TX_TYPE.支出) fail("分類必須是存在的支出分類");
  const purchaseDate = requiredDate(body.purchaseDate, "消費日");
  const total = int(body.total, "總金額", 1);
  const periods = int(body.periods, "期數", 2, 120);
  const fee = int(has(body, "fee") && str(body.fee) !== "" ? body.fee : 0, "手續費總額", 0);
  let firstBillMonth = str(body.firstBillMonth).trim();
  if (firstBillMonth === "") firstBillMonth = await defaultFirstBillMonth(card, purchaseDate);
  if (!MONTH_RE.test(firstBillMonth)) fail("首期帳單月份格式錯誤，須為 yyyy-MM；或先到「信用卡」設定結帳日讓系統自動推算");
  const remainderAt = str(has(body, "remainderAt") && str(body.remainderAt) ? body.remainderAt : REMAINDER_MODE.首期);
  if (!isOneOf(REMAINDER_MODE, remainderAt)) fail("尾差處理必須是首期或末期");

  return finCreate("F7_INSTALLMENT", {
    [F7.分期編號]: await nextCode("F7_INSTALLMENT", F7.分期編號, "I"),
    [F7.卡片]: card,
    [F7.品項]: item,
    [F7.分類]: category,
    [F7.消費日]: purchaseDate,
    [F7.總金額]: total,
    [F7.期數]: periods,
    [F7.首期帳單月份]: firstBillMonth,
    [F7.尾差處理]: remainderAt,
    [F7.手續費總額]: fee,
    [F7.狀態]: INST_STATUS.進行中,
    [F7.備註]: str(body.note),
  });
}

// 已有入帳期數後，金額／期數／卡片／首期月份／尾差不能再改（每期金額會對不上已入帳的明細）
export async function updateInstallment(recordId: string, body: InstallmentBody, postedCount: (code: string) => number): Promise<void> {
  const base = (await listInstallmentBases()).find((i) => i.id === recordId);
  if (!base) fail("找不到這筆分期", 404);
  const locked = ["card", "total", "periods", "firstBillMonth", "remainderAt", "fee"] as const;
  if (postedCount(base.code) > 0) {
    for (const k of locked) {
      if (has(body, k) && str(body[k]).trim() !== String(base[k]).trim()) fail("這筆分期已有入帳期數，不能修改金額、期數、卡片、首期月份、尾差或手續費");
    }
  }
  const f: WriteFields = {};
  if (has(body, "item")) {
    if (!str(body.item).trim()) fail("請輸入品項");
    f[F7.品項] = str(body.item).trim();
  }
  if (has(body, "category")) f[F7.分類] = str(body.category).trim();
  if (has(body, "status")) {
    const s = str(body.status);
    if (!isOneOf(INST_STATUS, s)) fail("狀態必須是進行中、已結清或提前清償");
    f[F7.狀態] = s;
  }
  if (has(body, "earlyDate")) f[F7.提前清償日] = optionalDate(body.earlyDate, "提前清償日");
  if (has(body, "note")) f[F7.備註] = str(body.note);
  if (postedCount(base.code) === 0) {
    if (has(body, "total")) f[F7.總金額] = int(body.total, "總金額", 1);
    if (has(body, "periods")) f[F7.期數] = int(body.periods, "期數", 2, 120);
    if (has(body, "fee")) f[F7.手續費總額] = int(body.fee, "手續費總額", 0);
    if (has(body, "firstBillMonth")) {
      if (!MONTH_RE.test(str(body.firstBillMonth))) fail("首期帳單月份格式錯誤，須為 yyyy-MM");
      f[F7.首期帳單月份] = str(body.firstBillMonth);
    }
    if (has(body, "remainderAt")) {
      if (!isOneOf(REMAINDER_MODE, str(body.remainderAt))) fail("尾差處理必須是首期或末期");
      f[F7.尾差處理] = str(body.remainderAt);
    }
  }
  if (Object.keys(f).length > 0) await finUpdate("F7_INSTALLMENT", recordId, f);
}

export async function writeInstallmentStatus(recordId: string, status: string): Promise<void> {
  await finUpdate("F7_INSTALLMENT", recordId, { [F7.狀態]: status });
}

// ── 貸款（F8）與利率異動（F8b）────────────────────────────────

const r8 = (rec: FinanceRecord, k: keyof typeof F8) => str(rec[k]);

export function toLoan(id: string, rec: FinanceRecord): LoanItem {
  return {
    id,
    code: r8(rec, "貸款編號"),
    name: r8(rec, "名稱"),
    institution: r8(rec, "貸款機構"),
    loanType: r8(rec, "貸款類型"),
    principal: num(rec["核貸金額" satisfies keyof typeof F8]),
    grantDate: normalizeRagicDate(rec["撥款日" satisfies keyof typeof F8]),
    rate: num(rec["年利率" satisfies keyof typeof F8]),
    rateType: r8(rec, "利率類型"),
    periods: num(rec["期數（月）" satisfies keyof typeof F8]),
    grace: num(rec["寬限期（月）" satisfies keyof typeof F8]),
    mode: r8(rec, "還款方式"),
    payDay: num(rec["每月扣款日" satisfies keyof typeof F8]),
    account: r8(rec, "扣款帳戶"),
    status: r8(rec, "狀態"),
  };
}

export async function listLoans(): Promise<LoanItem[]> {
  return (await finList("F8_LOAN")).map((r) => toLoan(r.id, r.rec));
}

export async function listRateChanges(): Promise<RateChangeItem[]> {
  const rows = await finList("F8B_RATE_CHANGE");
  return rows.map((r) => ({
    id: r.id,
    loanCode: str(r.rec["貸款編號" satisfies keyof typeof F8B]),
    effective: normalizeRagicDate(r.rec["生效日" satisfies keyof typeof F8B]),
    rate: num(r.rec["新年利率" satisfies keyof typeof F8B]),
    note: str(r.rec["備註" satisfies keyof typeof F8B]),
  }));
}

export interface LoanBody {
  name?: unknown;
  institution?: unknown;
  loanType?: unknown;
  principal?: unknown;
  grantDate?: unknown;
  rate?: unknown;
  rateType?: unknown;
  periods?: unknown;
  grace?: unknown;
  mode?: unknown;
  payDay?: unknown;
  account?: unknown;
  status?: unknown;
}

// 年利率存小數（0.0285），不可存 "2.85%"；超過 1 幾乎一定是填成百分比
function parseRate(v: unknown, label: string): number {
  const s = str(v).trim();
  if (s.includes("%")) fail(`${label}請填小數，例如 0.0285，不要帶 % 符號`);
  const n = Number(s);
  if (s === "" || !Number.isFinite(n) || n < 0 || n >= 1) fail(`${label}請填 0～1 之間的小數，例如 0.0285（代表 2.85%）`);
  return n;
}

async function loanFromBody(body: LoanBody, base?: LoanItem): Promise<Omit<LoanItem, "id" | "code">> {
  const pick = <K extends keyof LoanBody>(k: K, fallback: unknown) => (has(body, k) ? body[k] : fallback);
  const name = str(pick("name", base?.name)).trim();
  if (!name) fail("請輸入貸款名稱");
  const loanType = str(pick("loanType", base?.loanType || LOAN_TYPE.信貸));
  if (!isOneOf(LOAN_TYPE, loanType)) fail("貸款類型必須是信貸、房貸、車貸、學貸或其他");
  const rateType = str(pick("rateType", base?.rateType || RATE_TYPE.固定));
  if (!isOneOf(RATE_TYPE, rateType)) fail("利率類型必須是固定或機動");
  const mode = str(pick("mode", base?.mode || REPAY_MODE.本息平均攤還));
  if (!isOneOf(REPAY_MODE, mode)) fail("還款方式必須是本息平均攤還或本金平均攤還");
  const status = str(pick("status", base?.status || LOAN_STATUS.還款中));
  if (!isOneOf(LOAN_STATUS, status)) fail("狀態必須是還款中、已結清或提前清償");
  const periods = int(pick("periods", base?.periods), "期數（月）", 1, 600);
  const grace = int(pick("grace", base?.grace ?? 0), "寬限期（月）", 0, periods - 1);
  const account = str(pick("account", base?.account)).trim();
  const acc = (await listAccounts()).find((a) => a.code === account);
  if (!acc || acc.type === ACCOUNT_TYPE.信用卡) fail("扣款帳戶必須是存在的非信用卡帳戶");
  return {
    name,
    institution: str(pick("institution", base?.institution)).trim(),
    loanType,
    principal: int(pick("principal", base?.principal), "核貸金額", 1),
    grantDate: requiredDate(pick("grantDate", base?.grantDate), "撥款日"),
    rate: parseRate(pick("rate", base?.rate), "年利率"),
    rateType,
    periods,
    grace,
    mode,
    payDay: int(pick("payDay", base?.payDay ?? 1), "每月扣款日", 1, 31),
    account,
    status,
  };
}

function loanFields(code: string | null, l: Omit<LoanItem, "id" | "code">): WriteFields {
  const f: WriteFields = {
    [F8.名稱]: l.name,
    [F8.貸款機構]: l.institution,
    [F8.貸款類型]: l.loanType,
    [F8.核貸金額]: l.principal,
    [F8.撥款日]: l.grantDate,
    [F8.年利率]: l.rate,
    [F8.利率類型]: l.rateType,
    [F8["期數（月）"]]: l.periods,
    [F8["寬限期（月）"]]: l.grace,
    [F8.還款方式]: l.mode,
    [F8.每月扣款日]: l.payDay,
    [F8.扣款帳戶]: l.account,
    [F8.狀態]: l.status,
  };
  if (code) f[F8.貸款編號] = code;
  return f;
}

export async function createLoan(body: LoanBody): Promise<number> {
  const loan = await loanFromBody(body);
  return finCreate("F8_LOAN", loanFields(await nextCode("F8_LOAN", F8.貸款編號, "L"), loan));
}

export async function updateLoan(recordId: string, body: LoanBody): Promise<void> {
  const base = (await listLoans()).find((l) => l.id === recordId);
  if (!base) fail("找不到這筆貸款", 404);
  await finUpdate("F8_LOAN", recordId, loanFields(null, await loanFromBody(body, base)));
}

export async function writeLoanStatus(recordId: string, status: string): Promise<void> {
  await finUpdate("F8_LOAN", recordId, { [F8.狀態]: status });
}

export async function createRateChange(recordId: string, body: { effective?: unknown; rate?: unknown; note?: unknown }): Promise<number> {
  const loan = (await listLoans()).find((l) => l.id === recordId);
  if (!loan) fail("找不到這筆貸款", 404);
  return finCreate("F8B_RATE_CHANGE", {
    [F8B.貸款編號]: loan.code,
    [F8B.生效日]: requiredDate(body.effective, "生效日"),
    [F8B.新年利率]: parseRate(body.rate, "新年利率"),
    [F8B.備註]: str(body.note),
  });
}

// ── 保險（F9）─────────────────────────────────────────────────

const r9 = (rec: FinanceRecord, k: keyof typeof F9) => str(rec[k]);

export function toPolicy(id: string, rec: FinanceRecord): PolicyItem {
  return {
    id,
    code: r9(rec, "保單代號"),
    company: r9(rec, "保險公司"),
    product: r9(rec, "商品名稱"),
    kind: r9(rec, "險種"),
    holder: r9(rec, "要保人"),
    insured: r9(rec, "被保險人"),
    summary: r9(rec, "保障摘要"),
    effective: normalizeRagicDate(rec["生效日" satisfies keyof typeof F9]),
    freq: r9(rec, "繳別"),
    premium: num(rec["每期保費" satisfies keyof typeof F9]),
    payYears: num(rec["繳費年期" satisfies keyof typeof F9]),
    payEnd: normalizeRagicDate(rec["繳費終止日" satisfies keyof typeof F9]),
    maturity: normalizeRagicDate(rec["滿期日" satisfies keyof typeof F9]),
    payMode: r9(rec, "繳費方式"),
    account: r9(rec, "扣款帳戶"),
    status: r9(rec, "狀態"),
    claimContact: r9(rec, "理賠聯絡"),
    note: r9(rec, "備註"),
  };
}

export async function listPolicies(): Promise<PolicyItem[]> {
  return (await finList("F9_INSURANCE")).map((r) => toPolicy(r.id, r.rec));
}

export interface PolicyBody {
  company?: unknown;
  product?: unknown;
  kind?: unknown;
  holder?: unknown;
  insured?: unknown;
  summary?: unknown;
  effective?: unknown;
  freq?: unknown;
  premium?: unknown;
  payYears?: unknown;
  payEnd?: unknown;
  maturity?: unknown;
  payMode?: unknown;
  account?: unknown;
  status?: unknown;
  claimContact?: unknown;
  note?: unknown;
}

async function policyFromBody(body: PolicyBody, base?: PolicyItem): Promise<Omit<PolicyItem, "id" | "code">> {
  const pick = <K extends keyof PolicyBody>(k: K, fallback: unknown) => (has(body, k) ? body[k] : fallback);
  const product = str(pick("product", base?.product)).trim();
  if (!product) fail("請輸入商品名稱");
  const kind = str(pick("kind", base?.kind || INS_KIND.其他));
  if (!isOneOf(INS_KIND, kind)) fail("險種不在選項內");
  const freq = str(pick("freq", base?.freq || INS_FREQ.年繳));
  if (!isOneOf(INS_FREQ, freq)) fail("繳別必須是年繳、半年繳、季繳、月繳或躉繳");
  const payMode = str(pick("payMode", base?.payMode || INS_PAY_MODE.自行繳));
  if (!isOneOf(INS_PAY_MODE, payMode)) fail("繳費方式必須是信用卡、轉帳或自行繳");
  const status = str(pick("status", base?.status || INS_STATUS.有效));
  if (!isOneOf(INS_STATUS, status)) fail("狀態必須是有效、繳清、停效或解約");
  const account = str(pick("account", base?.account)).trim();
  if (payMode !== INS_PAY_MODE.自行繳) {
    const acc = (await listAccounts()).find((a) => a.code === account);
    if (!acc) fail("繳費方式為信用卡或轉帳時，必須選擇存在的扣款帳戶");
    if (payMode === INS_PAY_MODE.信用卡 && acc.type !== ACCOUNT_TYPE.信用卡) fail("繳費方式為信用卡時，扣款帳戶必須是信用卡帳戶");
    if (payMode === INS_PAY_MODE.轉帳 && acc.type === ACCOUNT_TYPE.信用卡) fail("繳費方式為轉帳時，扣款帳戶不能是信用卡");
  }
  return {
    company: str(pick("company", base?.company)).trim(),
    product,
    kind,
    holder: str(pick("holder", base?.holder)).trim(),
    insured: str(pick("insured", base?.insured)).trim(),
    summary: str(pick("summary", base?.summary)),
    effective: requiredDate(pick("effective", base?.effective), "生效日"),
    freq,
    premium: int(pick("premium", base?.premium), "每期保費", 0),
    payYears: int(pick("payYears", base?.payYears ?? 0), "繳費年期", 0, 100),
    payEnd: optionalDate(pick("payEnd", base?.payEnd), "繳費終止日"),
    maturity: optionalDate(pick("maturity", base?.maturity), "滿期日"),
    payMode,
    account: payMode === INS_PAY_MODE.自行繳 ? "" : account,
    status,
    claimContact: str(pick("claimContact", base?.claimContact)),
    note: str(pick("note", base?.note)),
  };
}

function policyFields(code: string | null, p: Omit<PolicyItem, "id" | "code">): WriteFields {
  const f: WriteFields = {
    [F9.保險公司]: p.company,
    [F9.商品名稱]: p.product,
    [F9.險種]: p.kind,
    [F9.要保人]: p.holder,
    [F9.被保險人]: p.insured,
    [F9.保障摘要]: p.summary,
    [F9.生效日]: p.effective,
    [F9.繳別]: p.freq,
    [F9.每期保費]: p.premium,
    [F9.繳費年期]: p.payYears,
    [F9.繳費終止日]: p.payEnd,
    [F9.滿期日]: p.maturity,
    [F9.繳費方式]: p.payMode,
    [F9.扣款帳戶]: p.account,
    [F9.狀態]: p.status,
    [F9.理賠聯絡]: p.claimContact,
    [F9.備註]: p.note,
  };
  if (code) f[F9.保單代號] = code;
  return f;
}

export async function createPolicy(body: PolicyBody): Promise<number> {
  const p = await policyFromBody(body);
  return finCreate("F9_INSURANCE", policyFields(await nextCode("F9_INSURANCE", F9.保單代號, "P"), p));
}

export async function updatePolicy(recordId: string, body: PolicyBody): Promise<void> {
  const base = (await listPolicies()).find((p) => p.id === recordId);
  if (!base) fail("找不到這張保單", 404);
  await finUpdate("F9_INSURANCE", recordId, policyFields(null, await policyFromBody(body, base)));
}

// ── 財務設定（F10，單筆表）────────────────────────────────────
// 只用「上次執行日」（每日引擎補跑區間的起點）。F10 的提醒欄位不再使用，讀寫都不碰。
// ⚠️ record id 0 是有效值：用 typeof／null 判斷有沒有紀錄，不可用 falsy。

export async function getSettings(): Promise<FinanceSettings> {
  const row = (await finList("F10_SETTINGS"))[0];
  if (!row) return { id: null, lastRun: "" };
  return { id: row.id, lastRun: normalizeRagicDate(row.rec["上次執行日" satisfies keyof typeof F10]) };
}

export async function saveSettings(patch: { lastRun: string }): Promise<void> {
  if (patch.lastRun && !DATE_RE.test(patch.lastRun)) fail("上次執行日格式錯誤");
  const current = await getSettings();
  // 更新時只送這一個欄位，其他欄位維持 Ragic 現況
  if (current.id === null) await finCreate("F10_SETTINGS", { [F10.設定名稱]: "財務設定", [F10.上次執行日]: patch.lastRun });
  else await finUpdate("F10_SETTINGS", current.id, { [F10.上次執行日]: patch.lastRun });
}
