// 信用卡帳單的繳款邏輯（手動與自動共用）。
// 刷卡 ≠ 繳卡費：繳卡費是「銀行 → 信用卡」的轉帳，不算支出，所以不會重複計入花費。
// 已繳金額一律由「來源鍵 PAY-{帳單編號}…的已入帳明細」重算，不累加，重跑也不會多算。

import type { StatementItem, TransactionItem } from "@/lib/financeTypes";
import { todayYMD } from "@/server/modules/dates";
import { TxWriter } from "./autoTx";
import { listStatements, statementStatus, writeStatementPayment } from "./entities";
import { loadContext, type FinanceContext } from "./engine";
import { ACCOUNT_TYPE, TX_SOURCE, TX_STATUS, TX_TYPE } from "./ragicFields";
import { fail, parseDate } from "./service";

export function paidOf(txs: TransactionItem[], statementCode: string): number {
  const base = `PAY-${statementCode}`;
  return txs
    .filter((t) => t.status === TX_STATUS.已入帳 && (t.sourceKey === base || t.sourceKey.startsWith(`${base}-`)))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function lastPayDate(txs: TransactionItem[], statementCode: string): string {
  const base = `PAY-${statementCode}`;
  return txs
    .filter((t) => t.sourceKey === base || t.sourceKey.startsWith(`${base}-`))
    .map((t) => t.date)
    .sort()
    .at(-1) ?? "";
}

// 依明細重算這張帳單的已繳金額與狀態並寫回（沒變就不寫）
export async function syncStatementPaid(s: StatementItem, txs: TransactionItem[], dryRun = false): Promise<StatementItem> {
  const paid = paidOf(txs, s.code);
  const status = statementStatus(s.payable, paid, s.status);
  if (paid === s.paid && status === s.status) return s;
  const paidDate = lastPayDate(txs, s.code) || s.paidDate;
  if (!dryRun) await writeStatementPayment(s.id, paid, paidDate, status);
  return { ...s, paid, status, paidDate };
}

export interface PayBody {
  amount?: unknown;
  fromAccount?: unknown;
  date?: unknown;
}

// 手動繳款：第一筆來源鍵 PAY-{帳單編號}，之後 PAY-{帳單編號}-2、-3…
export async function payStatement(recordId: string, body: PayBody): Promise<{ code: string; paid: number; status: string }> {
  const ctx: FinanceContext = await loadContext();
  const s = ctx.statements.find((x) => x.id === recordId) ?? (await listStatements()).find((x) => x.id === recordId);
  if (!s) fail("找不到這張帳單", 404);
  const remaining = s.payable - s.paid;
  if (remaining <= 0) fail("這張帳單已經繳清");

  const amount = Number(String(body.amount ?? "").trim());
  if (!Number.isInteger(amount) || amount <= 0) fail("繳款金額必須是大於 0 的整數");
  if (amount > remaining) fail(`繳款金額不能超過未繳金額 ${remaining}`);
  const from = String(body.fromAccount ?? "").trim();
  const acc = ctx.accounts.find((a) => a.code === from);
  if (!acc || !acc.active) fail("請選擇存在且啟用的扣款帳戶");
  if (acc.type === ACCOUNT_TYPE.信用卡) fail("扣款帳戶不能是信用卡");
  const date = body.date === undefined || String(body.date) === "" ? todayYMD() : parseDate(body.date, "繳款日");

  const existing = ctx.txs.filter((t) => t.sourceKey === `PAY-${s.code}` || t.sourceKey.startsWith(`PAY-${s.code}-`)).length;
  const writer = new TxWriter(ctx, false);
  await writer.emit({
    date,
    type: TX_TYPE.轉帳,
    amount,
    account: from,
    toAccount: s.card,
    summary: `${s.month} 卡費`,
    status: TX_STATUS.已入帳,
    source: TX_SOURCE.卡費,
    sourceKey: existing === 0 ? `PAY-${s.code}` : `PAY-${s.code}-${existing + 1}`,
  });
  const updated = await syncStatementPaid(s, ctx.txs);
  return { code: s.code, paid: updated.paid, status: updated.status };
}
