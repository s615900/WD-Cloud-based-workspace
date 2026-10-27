// 財務引擎：一次載入所有資料（context），再由純函式算出各種「計算值」——
// 貸款剩餘本金、保單年度保費、30 天內待付款、總覽。計算值只在記憶體裡，不寫回 Ragic。
// run-daily（daily.ts）與總覽 API 共用這裡，避免各算各的。

import type {
  AccountItem,
  AccountWithBalance,
  BudgetItem,
  BudgetStatus,
  CardOverview,
  CardSetting,
  CategoryItem,
  CategoryNature,
  DueItem,
  FinanceOverview,
  FinanceSettings,
  InstallmentItem,
  LoanItem,
  LoanView,
  MonthlyPoint,
  PolicyItem,
  PolicyView,
  RateChangeItem,
  RuleItem,
  StatementItem,
  TransactionItem,
} from "@/lib/financeTypes";
import { computeBalances } from "./balance";
import { addDaysYMD, addMonthsYM, daysBetween, eachDay } from "./dateUtil";
import {
  getSettings,
  listCardSettings,
  listInstallmentBases,
  listLoans,
  listPolicies,
  listRateChanges,
  listRules,
  listStatements,
  withInstallmentCalc,
} from "./entities";
import { periodsPerYear, paymentDates } from "./insurance";
import { buildSchedule, type LoanTerms } from "./loan";
import { occursOn } from "./recurrence";
import { cardLimits } from "./creditLimit";
import { ACCOUNT_TYPE, BUDGET_ALL, CATEGORY_NATURE, INS_PAY_MODE, INST_STATUS, INS_STATUS, LOAN_STATUS, STMT_STATUS, TX_STATUS, TX_TYPE } from "./ragicFields";
import { listAccounts, listBudgets, listCategories, listTransactions } from "./service";

export interface FinanceContext {
  accounts: AccountItem[];
  categories: CategoryItem[];
  budgets: BudgetItem[];
  txs: TransactionItem[];
  rules: RuleItem[];
  cards: CardSetting[];
  statements: StatementItem[];
  installments: InstallmentItem[];
  loans: LoanItem[];
  rateChanges: RateChangeItem[];
  policies: PolicyItem[];
  settings: FinanceSettings;
}

export async function loadContext(): Promise<FinanceContext> {
  const [accounts, categories, budgets, txs, rules, cards, statements, instBases, loans, rateChanges, policies, settings] = await Promise.all([
    listAccounts(),
    listCategories(),
    listBudgets(),
    listTransactions(),
    listRules(),
    listCardSettings(),
    listStatements(),
    listInstallmentBases(),
    listLoans(),
    listRateChanges(),
    listPolicies(),
    getSettings(),
  ]);
  const keys = new Set(txs.map((t) => t.sourceKey).filter(Boolean));
  return {
    accounts,
    categories,
    budgets,
    txs,
    rules,
    cards,
    statements,
    installments: instBases.map((b) => withInstallmentCalc(b, keys)),
    loans,
    rateChanges,
    policies,
    settings,
  };
}

// ── 貸款／保險檢視 ────────────────────────────────────────────

export function loanTerms(l: LoanItem): LoanTerms {
  return {
    principal: l.principal,
    annualRate: l.rate,
    periods: l.periods,
    grace: l.grace,
    mode: l.mode,
    grantDate: l.grantDate,
    payDay: l.payDay,
  };
}

export function loanSchedule(l: LoanItem, changes: RateChangeItem[]) {
  return buildSchedule(
    loanTerms(l),
    changes.filter((c) => c.loanCode === l.code).map((c) => ({ effective: c.effective, rate: c.rate })),
  );
}

export function buildLoanView(l: LoanItem, changes: RateChangeItem[], today: string): LoanView {
  const schedule = loanSchedule(l, changes);
  const done = schedule.filter((p) => p.due <= today);
  const next = schedule.find((p) => p.due > today);
  return {
    ...l,
    schedule,
    paidPeriods: l.status === LOAN_STATUS.還款中 ? done.length : schedule.length,
    remainingPrincipal: l.status === LOAN_STATUS.還款中 ? (done.at(-1)?.balance ?? l.principal) : 0,
    nextDue: l.status === LOAN_STATUS.還款中 ? (next?.due ?? "") : "",
    nextPayment: next?.payment ?? 0,
    rateChanges: changes.filter((c) => c.loanCode === l.code).sort((a, b) => a.effective.localeCompare(b.effective)),
  };
}

export function policySchedule(p: PolicyItem) {
  return { effective: p.effective, freq: p.freq, payEnd: p.payEnd, payYears: p.payYears, maturity: p.maturity };
}

export function buildPolicyView(p: PolicyItem, today: string): PolicyView {
  const active = p.status === INS_STATUS.有效;
  const next = active ? paymentDates(policySchedule(p), today, addDaysYMD(today, 366 * 2))[0] : undefined;
  return { ...p, annualPremium: p.premium * periodsPerYear(p.freq), nextPayDate: next ?? "" };
}

// ── 待付款時間軸 ──────────────────────────────────────────────

// 排程已產生過的項目（來源鍵存在）不再當「待付款」，預定的改由「待確認」呈現
function keysOf(txs: TransactionItem[]): Set<string> {
  return new Set(txs.map((t) => t.sourceKey).filter(Boolean));
}

export function computeDues(ctx: FinanceContext, today: string, horizonDays = 30): DueItem[] {
  const to = addDaysYMD(today, horizonDays);
  const keys = keysOf(ctx.txs);
  const dues: DueItem[] = [];
  const left = (date: string) => daysBetween(today, date);
  const accName = (code: string) => ctx.accounts.find((a) => a.code === code)?.name ?? code;

  // 卡費：未繳足的帳單（逾期的也列出，daysLeft 為負）
  for (const s of ctx.statements) {
    const remaining = s.payable - s.paid;
    if (s.status === STMT_STATUS.已繳 || remaining <= 0) continue;
    if (s.dueDate > to) continue;
    dues.push({
      date: s.dueDate,
      kind: "卡費",
      title: `${accName(s.card)} ${s.month} 帳單`,
      amount: remaining,
      daysLeft: left(s.dueDate),
      detail: s.status === STMT_STATUS.逾期 ? "已逾期" : undefined,
    });
  }

  // 保費
  for (const p of ctx.policies) {
    if (p.status !== INS_STATUS.有效) continue;
    for (const d of paymentDates(policySchedule(p), today, to)) {
      if (keys.has(`INS-${p.code}-${d.replaceAll("-", "")}`)) continue;
      dues.push({
        date: d,
        kind: "保費",
        title: `${p.product}${p.company ? `（${p.company}）` : ""}`,
        amount: p.premium,
        daysLeft: left(d),
        detail: p.payMode === INS_PAY_MODE.自行繳 ? "自行繳" : `${p.payMode}自動入帳`,
      });
    }
  }

  // 貸款
  for (const l of ctx.loans) {
    if (l.status !== LOAN_STATUS.還款中) continue;
    for (const p of loanSchedule(l, ctx.rateChanges)) {
      if (p.due < today || p.due > to) continue;
      if (keys.has(`LOAN-${l.code}-${p.k}`)) continue;
      dues.push({
        date: p.due,
        kind: "貸款",
        title: `${l.name} 第 ${p.k}/${l.periods} 期`,
        amount: p.payment,
        daysLeft: left(p.due),
      });
    }
  }

  // 定期規則（只列支出與轉帳；收入不是「要付的錢」）
  for (const r of ctx.rules) {
    if (!r.active || r.type === TX_TYPE.收入) continue;
    for (const d of eachDay(today, to)) {
      if (!occursOn(r, d) || keys.has(`RULE-${r.code}-${d.replaceAll("-", "")}`)) continue;
      dues.push({ date: d, kind: "定期", title: r.name, amount: r.amount, daysLeft: left(d) });
    }
  }

  // 待確認的預定明細（日期已到或即將到）
  for (const t of ctx.txs) {
    if (t.status !== TX_STATUS.預定 || t.date > to) continue;
    dues.push({
      date: t.date,
      kind: "待確認",
      title: t.summary || t.category || t.code,
      amount: t.amount,
      daysLeft: left(t.date),
      detail: t.type,
    });
  }

  return dues.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

// ── 總覽 ──────────────────────────────────────────────────────

export function withBalances(ctx: FinanceContext): AccountWithBalance[] {
  const balances = computeBalances(ctx.accounts, ctx.txs);
  return ctx.accounts.map((a) => ({ ...a, balance: balances.get(a.code) ?? a.openingBalance }));
}

export function monthSummary(txs: TransactionItem[], month: string, categories: CategoryItem[] = []) {
  const natureOf = (name: string): CategoryNature => categories.find((c) => c.name === name)?.nature ?? CATEGORY_NATURE.彈性;
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();
  for (const t of txs) {
    if (!t.date.startsWith(month) || t.status !== TX_STATUS.已入帳) continue;
    if (t.type === TX_TYPE.收入) income += t.amount;
    if (t.type === TX_TYPE.支出) {
      expense += t.amount;
      byCategory.set(t.category || "（未分類）", (byCategory.get(t.category || "（未分類）") ?? 0) + t.amount);
    }
  }
  const expenseByCategory = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount, nature: natureOf(category) }))
    .sort((a, b) => b.amount - a.amount);
  const fixedExpense = expenseByCategory.filter((c) => c.nature === CATEGORY_NATURE.固定).reduce((sum, c) => sum + c.amount, 0);
  return {
    summary: { income, expense, net: income - expense },
    expenseByCategory,
    fixedExpense,
    flexExpense: expense - fixedExpense,
  };
}

// 本月預算使用狀況：「全部」排第一，其餘照支出金額由大到小
export function budgetStatuses(budgets: BudgetItem[], totalExpense: number, byCategory: { category: string; amount: number }[]): BudgetStatus[] {
  const list = budgets.map((b) => {
    const spent = b.target === BUDGET_ALL ? totalExpense : (byCategory.find((c) => c.category === b.target)?.amount ?? 0);
    return { target: b.target, limit: b.limit, spent, remaining: b.limit - spent };
  });
  return list.sort((x, y) => (x.target === BUDGET_ALL ? -1 : y.target === BUDGET_ALL ? 1 : y.spent - x.spent));
}

// 近 N 個月（含本月）每月已入帳的收入與支出，舊→新；沒有明細的月份補 0
export function monthlySeries(txs: TransactionItem[], month: string, count = 12): MonthlyPoint[] {
  const points = Array.from({ length: count }, (_, i) => ({ month: addMonthsYM(month, i - (count - 1)), income: 0, expense: 0 }));
  const byMonth = new Map(points.map((p) => [p.month, p]));
  for (const t of txs) {
    if (t.status !== TX_STATUS.已入帳) continue;
    const p = byMonth.get(t.date.slice(0, 7));
    if (!p) continue;
    if (t.type === TX_TYPE.收入) p.income += t.amount;
    if (t.type === TX_TYPE.支出) p.expense += t.amount;
  }
  return points;
}

export function buildOverview(ctx: FinanceContext, today: string): FinanceOverview {
  const month = today.slice(0, 7);
  const accounts = withBalances(ctx);
  const { summary, expenseByCategory, fixedExpense, flexExpense } = monthSummary(ctx.txs, month, ctx.categories);

  // 額度按機構共用：同一家機構的卡合併算（含進行中分期的剩餘金額）
  const limits = cardLimits(
    accounts.filter((a) => a.type === ACCOUNT_TYPE.信用卡 && a.active),
    (code) => ctx.cards.find((c) => c.account === code)?.limit ?? 0,
    ctx.installments,
    INST_STATUS.進行中,
  );
  const cards: CardOverview[] = accounts
    .filter((a) => a.type === ACCOUNT_TYPE.信用卡 && a.active)
    .map((a) => {
      const l = limits.get(a.code)!;
      return { account: a.code, name: a.name, unpaid: a.balance, limit: l.limit, used: l.used, remaining: l.remaining, shared: l.shared, usage: l.usage };
    });

  const loans = ctx.loans
    .filter((l) => l.status === LOAN_STATUS.還款中)
    .map((l) => buildLoanView(l, ctx.rateChanges, today))
    .map((v) => ({ code: v.code, name: v.name, remainingPrincipal: v.remainingPrincipal, paidPeriods: v.paidPeriods, periods: v.periods }));

  // 保險：今年（1/1～12/31）會繳的保費總額、下一筆繳費日
  const year = today.slice(0, 4);
  let annualTotal = 0;
  let nextPayDate = "";
  for (const p of ctx.policies) {
    if (p.status !== INS_STATUS.有效) continue;
    annualTotal += paymentDates(policySchedule(p), `${year}-01-01`, `${year}-12-31`).length * p.premium;
    const next = paymentDates(policySchedule(p), today, addDaysYMD(today, 366 * 2))[0];
    if (next && (!nextPayDate || next < nextPayDate)) nextPayDate = next;
  }

  return {
    month,
    summary,
    expenseByCategory,
    fixedExpense,
    flexExpense,
    budgets: budgetStatuses(ctx.budgets, summary.expense, expenseByCategory),
    monthly: monthlySeries(ctx.txs, month),
    dues: computeDues(ctx, today, 30),
    cards,
    loans,
    insurance: { annualTotal, nextPayDate },
  };
}
