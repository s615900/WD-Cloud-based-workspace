// 貸款攤還表：純函式，不碰 Ragic。金額四捨五入到元，末期吸收尾差。
//   本息平均：寬限期內只繳利息；之後每期固定金額 = B·r ÷ (1 − (1+r)^−m)，B＝剩餘本金、m＝剩餘期數
//   本金平均：寬限期外每期本金 = 核貸金額 ÷ (期數 − 寬限期)，利息 = 剩餘本金 × r
//   利率異動：生效日當天（含）之後的期別改用新利率，本息平均從該期起以剩餘本金重算每期金額
// 銀行實際按日計息，這裡是「試算」。

import { addMonthsYM, clampYMD } from "./dateUtil.ts";

export interface LoanTerms {
  principal: number;
  annualRate: number; // 0.0285
  periods: number;
  grace: number;
  mode: string; // 本息平均攤還／本金平均攤還
  grantDate: string;
  payDay: number; // 每月扣款日；0 → 用撥款日的日
}

export interface RateChange {
  effective: string;
  rate: number;
}

export interface LoanPeriod {
  k: number;
  due: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number; // 該期繳完後的剩餘本金
}

export const LOAN_MODE_EQUAL_PAYMENT = "本息平均攤還";

export function dueDateOf(terms: LoanTerms, k: number): string {
  const ym = addMonthsYM(terms.grantDate.slice(0, 7), k);
  const day = terms.payDay >= 1 ? terms.payDay : Number(terms.grantDate.slice(8, 10));
  return clampYMD(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), day);
}

function levelPayment(balance: number, monthlyRate: number, periods: number): number {
  if (monthlyRate === 0) return balance / periods;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -periods));
}

export function buildSchedule(terms: LoanTerms, changes: RateChange[] = []): LoanPeriod[] {
  const n = Math.max(0, Math.floor(terms.periods));
  const grace = Math.min(Math.max(0, Math.floor(terms.grace)), Math.max(0, n - 1));
  const sorted = [...changes].sort((a, b) => a.effective.localeCompare(b.effective));
  const rateAt = (due: string) => {
    let rate = terms.annualRate;
    for (const c of sorted) if (c.effective <= due) rate = c.rate;
    return rate;
  };

  const out: LoanPeriod[] = [];
  let balance = terms.principal;
  let lastRate: number | null = null;
  let level = 0;
  const fixedPrincipal = n - grace > 0 ? Math.round(terms.principal / (n - grace)) : 0;

  for (let k = 1; k <= n; k++) {
    const due = dueDateOf(terms, k);
    const annual = rateAt(due);
    const r = annual / 12;
    const interest = Math.round(balance * r);
    let principal = 0;

    if (k > grace) {
      if (terms.mode === LOAN_MODE_EQUAL_PAYMENT) {
        if (lastRate === null || annual !== lastRate) {
          level = Math.round(levelPayment(balance, r, n - k + 1));
          lastRate = annual;
        }
        principal = level - interest;
      } else {
        principal = fixedPrincipal;
      }
      if (k === n) principal = balance; // 末期吸收尾差
      principal = Math.max(0, Math.min(principal, balance));
    }
    balance -= principal;
    out.push({ k, due, payment: principal + interest, principal, interest, balance });
  }
  return out;
}
