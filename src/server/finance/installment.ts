// 信用卡分期：每期金額 = floor(總額 ÷ 期數)，尾差放首期或末期；手續費平均攤入各期（同樣的尾差處理）。
import { addMonthsYM } from "./dateUtil.ts";

export function splitInstallment(total: number, periods: number, fee: number, remainderAtFirst: boolean): number[] {
  const n = Math.max(1, Math.floor(periods));
  const base = Math.floor(total / n);
  const feeBase = Math.floor(fee / n);
  const rem = total - base * n + (fee - feeBase * n);
  const amounts = Array.from({ length: n }, () => base + feeBase);
  amounts[remainderAtFirst ? 0 : n - 1] += rem;
  return amounts;
}

// 第 k 期（從 1 起算）落在哪個帳單月份
export function billMonthOfPeriod(firstBillMonth: string, k: number): string {
  return addMonthsYM(firstBillMonth, k - 1);
}
