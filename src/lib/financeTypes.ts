// 個人財務模組前後端共用的型別（只有型別，沒有執行期程式碼）。
import type { AccountType, CategoryKind, TxSource, TxStatus, TxType } from "@/server/finance/ragicFields";

export type { AccountType, CategoryKind, TxSource, TxStatus, TxType };

// id 是 Ragic 紀錄編號（字串，第一筆是 "0"，0 是有效值）；code 是 AC-001 這類業務編號
export interface AccountItem {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  institution: string;
  last4: string;
  openingBalance: number;
  openingDate: string; // yyyy-MM-dd
  isDefault: boolean;
  active: boolean;
  order: number;
  note: string;
}

// 信用卡的 balance 是「目前未繳」（正數代表欠款），其他帳戶是目前餘額
export interface AccountWithBalance extends AccountItem {
  balance: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  order: number;
  active: boolean;
}

export interface TransactionItem {
  id: string;
  code: string;
  date: string; // yyyy-MM-dd
  type: TxType;
  amount: number;
  account: string; // 帳戶編號
  toAccount: string; // 轉帳才有
  category: string; // 分類名稱，轉帳可空
  summary: string;
  status: TxStatus;
  source: TxSource;
  sourceKey: string;
  billMonth: string; // yyyy-MM，信用卡帳戶才有
  createdAt: string;
  note: string;
}

export interface TransactionSummary {
  income: number;
  expense: number;
  net: number;
}

export interface TransactionList {
  items: TransactionItem[];
  summary: TransactionSummary;
}

export interface SeedResult {
  success: true;
  dryRun: boolean;
  toCreate: { name: string; kind: CategoryKind }[];
  skipped: { name: string; kind: CategoryKind }[];
}

// ── F2 之後的積木 ──────────────────────────────────────────────

export interface RuleItem {
  id: string;
  code: string;
  name: string;
  type: TxType;
  amount: number;
  account: string;
  toAccount: string;
  category: string;
  freq: string; // 每月／每週／每年／每N月
  intervalN: number;
  day: number; // 每月／每年＝幾號；每週＝星期幾（1=週一…7=週日）
  start: string;
  end: string;
  autoPost: boolean; // 是＝直接已入帳；否＝產生「預定」等確認
  active: boolean;
}

export interface CardSetting {
  id: string;
  account: string; // 帳戶編號
  closingDay: number;
  dueDay: number;
  limit: number;
  autoDebitAccount: string;
  debitMode: string; // 全額／最低
}

export interface StatementItem {
  id: string;
  code: string;
  card: string;
  month: string;
  closingDate: string;
  dueDate: string;
  systemAmount: number;
  bankAmount: number | null; // 手填，有值時以此為準
  minDue: number | null;
  paid: number;
  paidDate: string;
  status: string;
  payable: number; // 銀行帳單金額有值就用它，否則用系統試算金額
  diff: number | null; // 對帳差額 = 銀行帳單金額 − 系統試算金額（沒填銀行金額時為 null）
}

export interface InstallmentItem {
  id: string;
  code: string;
  card: string;
  item: string;
  category: string;
  purchaseDate: string;
  total: number;
  periods: number;
  firstBillMonth: string;
  remainderAt: string; // 首期／末期
  fee: number;
  status: string;
  earlyDate: string;
  note: string;
  amounts: number[]; // 每期金額（計算值）
  posted: number; // 已入帳期數（計算值）
  remaining: number; // 剩餘金額（計算值）
}

export interface LoanItem {
  id: string;
  code: string;
  name: string;
  institution: string;
  loanType: string;
  principal: number;
  grantDate: string;
  rate: number; // 0.0285
  rateType: string;
  periods: number;
  grace: number;
  mode: string;
  payDay: number;
  account: string;
  status: string;
}

export interface RateChangeItem {
  id: string;
  loanCode: string;
  effective: string;
  rate: number;
  note: string;
}

export interface LoanPeriodItem {
  k: number;
  due: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanView extends LoanItem {
  schedule: LoanPeriodItem[];
  paidPeriods: number; // 扣款日 ≤ 今天的期數
  remainingPrincipal: number;
  nextDue: string;
  nextPayment: number;
  rateChanges: RateChangeItem[];
}

export interface PolicyItem {
  id: string;
  code: string;
  company: string;
  product: string;
  kind: string;
  holder: string;
  insured: string;
  summary: string;
  effective: string;
  freq: string;
  premium: number;
  payYears: number;
  payEnd: string;
  maturity: string;
  payMode: string;
  account: string;
  status: string;
  claimContact: string;
  note: string;
}

export interface PolicyView extends PolicyItem {
  annualPremium: number;
  nextPayDate: string;
}

export interface FinanceSettings {
  id: string | null; // F10 是單筆表，record id 0 是有效值
  lastRun: string;
}

export interface DueItem {
  date: string;
  kind: "卡費" | "保費" | "貸款" | "定期" | "待確認";
  title: string;
  amount: number;
  daysLeft: number; // 負數＝已逾期／已過期
  detail?: string;
}

export interface CardOverview {
  account: string;
  name: string;
  unpaid: number;
  limit: number; // 機構共用額度
  used: number; // 機構已占用（未繳＋分期剩餘）
  remaining: number; // 機構剩餘額度
  shared: string[]; // 同機構的卡名稱
  usage: number | null; // 已占用比例 0~1，沒設額度為 null
}

export interface FinanceOverview {
  month: string;
  summary: TransactionSummary;
  expenseByCategory: { category: string; amount: number }[];
  dues: DueItem[];
  cards: CardOverview[];
  loans: { code: string; name: string; remainingPrincipal: number; paidPeriods: number; periods: number }[];
  insurance: { annualTotal: number; nextPayDate: string };
}

export interface RunDailyResult {
  success: true;
  dryRun: boolean;
  from: string;
  to: string;
  created: { sourceKey: string; date: string; type: string; amount: number; account: string; summary: string; status: string }[];
  skippedExisting: number;
  statements: { code: string; action: string }[];
  warnings: string[];
}
