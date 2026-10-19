// 信用卡帳單週期：結帳日／繳款截止日推算。純函式，不碰 Ragic。
import { addMonthsYM, clampYMD } from "./dateUtil.ts";

// 帳單月份 ym（yyyy-MM）的結帳日；結帳日 31 遇小月夾到月底
export function closingDateOf(ym: string, closingDay: number): string {
  return clampYMD(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), closingDay);
}

// 繳款截止日：截止日 ≤ 結帳日視為次月
export function dueDateOf(ym: string, closingDay: number, dueDay: number): string {
  const month = dueDay <= closingDay ? addMonthsYM(ym, 1) : ym;
  return clampYMD(Number(month.slice(0, 4)), Number(month.slice(5, 7)), dueDay);
}

// 某天是不是該卡的結帳日（回傳帳單月份），不是就回 null
export function closingMonthOn(date: string, closingDay: number): string | null {
  const ym = date.slice(0, 7);
  return closingDateOf(ym, closingDay) === date ? ym : null;
}
