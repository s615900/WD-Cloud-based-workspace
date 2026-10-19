// 每日引擎 run-daily。順序有依賴，不可調換（04 §3）：
//   1 補跑區間 → 2 定期規則 → 3 保險 → 4 貸款 → 5 信用卡結帳（分期 → 彙總 → 建帳單）
//   → 6 卡費自動扣繳 → 7 逾期標記 → 8 寫回上次執行日 → 9 LINE 推播彙整
// 全程以「來源鍵」防重複：重跑、補跑都不會重複產生。dryRun 只回傳會做什麼，不寫入、不推播。

import type { DueItem, RunDailyResult, StatementItem } from "@/lib/financeTypes";
import { pushTextMessageToOwner } from "@/server/bot/linePush";
import { todayYMD } from "@/server/modules/dates";
import { TxWriter } from "./autoTx";
import { syncStatementPaid } from "./cards";
import { addDaysYMD, addMonthsYM, eachDay } from "./dateUtil";
import { createStatement, saveSettings, writeInstallmentStatus, writeLoanStatus, writeStatementStatus, writeStatementSystemAmount } from "./entities";
import { computeDues, loadContext, loanSchedule, policySchedule } from "./engine";
import { billMonthOfPeriod } from "./installment";
import { paymentDates } from "./insurance";
import { occursOn } from "./recurrence";
import {
  AUTO_CATEGORY,
  DEBIT_MODE,
  INS_PAY_MODE,
  INS_STATUS,
  INST_STATUS,
  LOAN_STATUS,
  STMT_STATUS,
  TX_SOURCE,
  TX_STATUS,
  TX_TYPE,
} from "./ragicFields";
import { closingDateOf, closingMonthOn, dueDateOf } from "./statement";

export interface RunOptions {
  dryRun: boolean;
  today?: string; // 測試用，預設台北今天
  from?: string; // 手動指定補跑起點，預設＝上次執行日隔天
  push?: boolean; // 預設正式執行才推播
}

const ymd8 = (d: string) => d.replaceAll("-", "");

export async function runDaily(opts: RunOptions): Promise<RunDailyResult> {
  const ctx = await loadContext();
  const today = opts.today ?? todayYMD();
  // 補跑區間：上次執行日隔天～今天（停機幾天也不漏）。首次執行（沒有上次執行日）只處理今天，不回補。
  // 上次執行日＝今天時仍處理今天（來源鍵保證不重複），方便手動重跑。
  const lastRun = ctx.settings.lastRun;
  let from = opts.from ?? (lastRun ? addDaysYMD(lastRun, 1) : today);
  if (from > today) from = today;
  const days = eachDay(from, today);

  const writer = new TxWriter(ctx, opts.dryRun);
  const warnings: string[] = [];
  const statementLog: RunDailyResult["statements"] = [];
  const accountOk = (code: string, label: string) => {
    const ok = ctx.accounts.some((a) => a.code === code);
    if (!ok) warnings.push(`${label}：找不到帳戶「${code}」，已略過`);
    return ok;
  };
  const statements: StatementItem[] = [...ctx.statements];

  for (const d of days) {
    // 2. 定期規則 ───────────────────────────────────────────
    for (const r of ctx.rules) {
      if (!r.active || !occursOn(r, d)) continue;
      if (!accountOk(r.account, `規則 ${r.code}`)) continue;
      if (r.type === TX_TYPE.轉帳 && !accountOk(r.toAccount, `規則 ${r.code}`)) continue;
      await writer.emit({
        date: d,
        type: r.type,
        amount: r.amount,
        account: r.account,
        toAccount: r.type === TX_TYPE.轉帳 ? r.toAccount : "",
        category: r.type === TX_TYPE.轉帳 ? "" : r.category,
        summary: r.name,
        status: r.autoPost ? TX_STATUS.已入帳 : TX_STATUS.預定,
        source: TX_SOURCE.定期,
        sourceKey: `RULE-${r.code}-${ymd8(d)}`,
      });
    }

    // 3. 保險：繳費日產生支出（繳費方式為信用卡時帳戶記該卡，之後自動進卡單）─────────
    for (const p of ctx.policies) {
      if (p.status !== INS_STATUS.有效 || p.payMode === INS_PAY_MODE.自行繳) continue;
      if (paymentDates(policySchedule(p), d, d).length === 0) continue;
      if (!accountOk(p.account, `保單 ${p.code}`)) continue;
      await writer.emit({
        date: d,
        type: TX_TYPE.支出,
        amount: p.premium,
        account: p.account,
        category: AUTO_CATEGORY.保險,
        summary: `${p.product} 保費`,
        status: TX_STATUS.已入帳,
        source: TX_SOURCE.保險,
        sourceKey: `INS-${p.code}-${ymd8(d)}`,
      });
    }

    // 4. 貸款：扣款日產生支出（分類＝貸款還款），金額取攤還表該期 ───────────────
    for (const l of ctx.loans) {
      if (l.status !== LOAN_STATUS.還款中) continue;
      const period = loanSchedule(l, ctx.rateChanges).find((p) => p.due === d);
      if (!period || period.payment <= 0) continue;
      if (!accountOk(l.account, `貸款 ${l.code}`)) continue;
      await writer.emit({
        date: d,
        type: TX_TYPE.支出,
        amount: period.payment,
        account: l.account,
        category: AUTO_CATEGORY.貸款還款,
        summary: `${l.name} 第 ${period.k}/${l.periods} 期`,
        status: TX_STATUS.已入帳,
        source: TX_SOURCE.貸款,
        sourceKey: `LOAN-${l.code}-${period.k}`,
      });
      if (period.k === l.periods && !opts.dryRun) await writeLoanStatus(l.id, LOAN_STATUS.已結清);
    }

    // 5. 信用卡結帳 ─────────────────────────────────────────
    for (const card of ctx.cards) {
      const month = closingMonthOn(d, card.closingDay);
      if (!month) continue;
      if (!accountOk(card.account, `信用卡設定`)) continue;

      // 5a. 本期分期明細（INST）
      for (const inst of ctx.installments) {
        if (inst.card !== card.account || inst.status !== INST_STATUS.進行中) continue;
        for (let k = 1; k <= inst.periods; k++) {
          if (billMonthOfPeriod(inst.firstBillMonth, k) !== month) continue;
          await writer.emit({
            date: d,
            type: TX_TYPE.支出,
            amount: inst.amounts[k - 1]!,
            account: card.account,
            category: inst.category,
            summary: `${inst.item} 第 ${k}/${inst.periods} 期`,
            status: TX_STATUS.已入帳,
            source: TX_SOURCE.分期,
            sourceKey: `INST-${inst.code}-${k}`,
            billMonth: month,
          });
          if (k === inst.periods && !opts.dryRun) await writeInstallmentStatus(inst.id, INST_STATUS.已結清);
        }
      }

      // 5b. 彙總本期：該卡的支出 − 退款 + 前期未繳（轉入＝繳卡費，不是消費，不計）
      const prevClosing = closingDateOf(addMonthsYM(month, -1), card.closingDay);
      let net = 0;
      for (const t of ctx.txs) {
        if (t.account !== card.account || t.status !== TX_STATUS.已入帳) continue;
        const inPeriod = t.billMonth ? t.billMonth === month : t.date > prevClosing && t.date <= d;
        if (!inPeriod) continue;
        if (t.type === TX_TYPE.支出) net += t.amount;
        if (t.type === TX_TYPE.收入) net -= t.amount;
      }
      const prev = statements
        .filter((s) => s.card === card.account && s.month < month)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      const carry = prev ? Math.max(0, prev.payable - prev.paid) : 0;
      const systemAmount = net + carry;

      // 5c. 建立（或更新）F6 帳單，狀態＝待繳
      const code = `STMT-${card.account}-${month.replace("-", "")}`;
      const existing = statements.find((s) => s.code === code);
      if (existing) {
        if (existing.systemAmount !== systemAmount) {
          if (!opts.dryRun) await writeStatementSystemAmount(existing.id, systemAmount);
          Object.assign(existing, { systemAmount, payable: existing.bankAmount ?? systemAmount });
          statementLog.push({ code, action: `更新系統試算金額 ${systemAmount}` });
        }
      } else {
        const dueDate = dueDateOf(month, card.closingDay, card.dueDay);
        const id = opts.dryRun ? `dry-${code}` : String(await createStatement({ code, card: card.account, month, closingDate: d, dueDate, systemAmount }));
        statements.push({
          id,
          code,
          card: card.account,
          month,
          closingDate: d,
          dueDate,
          systemAmount,
          bankAmount: null,
          minDue: null,
          paid: 0,
          paidDate: "",
          status: STMT_STATUS.待繳,
          payable: systemAmount,
          diff: null,
        });
        statementLog.push({ code, action: `建立帳單，系統試算金額 ${systemAmount}，截止日 ${dueDate}` });
      }
    }

    // 6. 卡費自動扣繳：今日為截止日且有扣繳帳戶 → 轉帳 + 帳單改已繳 ──────────────
    for (const card of ctx.cards) {
      if (!card.autoDebitAccount) continue;
      for (const s of statements.filter((x) => x.card === card.account && x.dueDate === d && x.status !== STMT_STATUS.已繳)) {
        const remaining = s.payable - s.paid;
        let amount = remaining;
        if (card.debitMode === DEBIT_MODE.最低) {
          if (s.minDue === null) {
            warnings.push(`${s.code}：扣繳方式為「最低」但還沒填最低應繳，未自動扣繳`);
            continue;
          }
          amount = Math.min(s.minDue, remaining);
        }
        if (amount <= 0 || !accountOk(card.autoDebitAccount, `卡片 ${card.account} 自動扣繳`)) continue;
        await writer.emit({
          date: d,
          type: TX_TYPE.轉帳,
          amount,
          account: card.autoDebitAccount,
          toAccount: card.account,
          summary: `${s.month} 卡費自動扣繳`,
          status: TX_STATUS.已入帳,
          source: TX_SOURCE.卡費,
          sourceKey: `PAY-${s.code}`,
        });
        statementLog.push({ code: s.code, action: `自動扣繳 ${amount}` });
        // 立刻把已繳金額同步回帳單：之後同一次補跑裡的結帳要用「前期未繳」，不能等到整輪結束才更新
        const idx = statements.findIndex((x) => x.code === s.code);
        statements[idx] = await syncStatementPaid(statements[idx]!, ctx.txs, opts.dryRun);
      }
    }
  }

  // 已繳金額由明細重算（idempotent），再做 7. 逾期標記
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i]!;
    if (s.id.startsWith("dry-")) {
      statements[i] = { ...s, paid: s.paid };
      continue;
    }
    statements[i] = await syncStatementPaid(s, ctx.txs, opts.dryRun);
    const cur = statements[i]!;
    if ((cur.status === STMT_STATUS.待繳 || cur.status === STMT_STATUS.部分繳) && cur.dueDate < today && cur.payable - cur.paid > 0) {
      if (!opts.dryRun) await writeStatementStatus(cur.id, STMT_STATUS.逾期);
      statements[i] = { ...cur, status: STMT_STATUS.逾期 };
      statementLog.push({ code: cur.code, action: "標記逾期" });
    }
  }

  // 8. 寫回上次執行日
  const firstRunToday = lastRun !== today;
  if (!opts.dryRun) await saveSettings({ lastRun: today });

  // 9. LINE 推播彙整：到期前 N 天的項目合併成一則；沒有項目不推
  ctx.statements = statements;
  const pushText = buildPushText(computeDues(ctx, today, 30), today, ctx.settings.remindOn);
  let pushed = false;
  const shouldPush = (opts.push ?? !opts.dryRun) && !opts.dryRun && firstRunToday;
  if (pushText && shouldPush) {
    try {
      await pushTextMessageToOwner(pushText);
      pushed = true;
    } catch (err) {
      console.error("財務推播失敗:", err);
      warnings.push("LINE 推播失敗（明細已正常產生）");
    }
  }

  return {
    success: true,
    dryRun: opts.dryRun,
    from,
    to: today,
    created: writer.created.map((c) => ({
      sourceKey: c.sourceKey,
      date: c.date,
      type: c.type,
      amount: c.amount,
      account: c.account,
      summary: c.summary,
      status: c.status,
    })),
    skippedExisting: writer.skippedExisting,
    statements: statementLog,
    warnings,
    pushText,
    pushed,
  };
}

const KIND_ICON: Record<DueItem["kind"], string> = { 卡費: "💳", 保費: "🛡️", 貸款: "🏦", 定期: "🔁", 待確認: "❓" };

export function formatDueLine(d: DueItem): string {
  const when = d.daysLeft < 0 ? `已逾 ${-d.daysLeft} 天` : d.daysLeft === 0 ? "今天" : `${d.daysLeft} 天後`;
  const md = d.date.slice(5).replace("-", "/");
  return `${KIND_ICON[d.kind]} ${md} ${d.title} $${d.amount.toLocaleString("en-US")}（${when}${d.detail ? `・${d.detail}` : ""}）`;
}

// 推播內容：只放「在提醒天數內」或已逾期的項目。沒有就回 null（不推）。
export function buildPushText(dues: DueItem[], today: string, remindOn: boolean): string | null {
  if (!remindOn) return null;
  const due = dues.filter((d) => d.daysLeft <= (d.remindDays ?? 3));
  if (due.length === 0) return null;
  const lines = due.map(formatDueLine);
  return [`💰 財務提醒（${today.slice(5).replace("-", "/")}）`, ...lines].join("\n");
}
