// 保險：由生效日 + 繳別推算繳費日。純函式，不碰 Ragic。
import { addMonthsYMD } from "./dateUtil.ts";

export interface PolicySchedule {
  effective: string;
  freq: string; // 年繳／半年繳／季繳／月繳／躉繳
  payEnd: string; // 繳費終止日（含），空字串＝未填
  payYears: number; // 繳費年期，0＝未填
  maturity: string; // 滿期日，空字串＝未填
}

const INTERVAL_MONTHS: Record<string, number> = { 年繳: 12, 半年繳: 6, 季繳: 3, 月繳: 1 };
const PERIODS_PER_YEAR: Record<string, number> = { 年繳: 1, 半年繳: 2, 季繳: 4, 月繳: 12 };

export function periodsPerYear(freq: string): number {
  return PERIODS_PER_YEAR[freq] ?? 0; // 躉繳不算年度保費
}

// from～to（含）之間的繳費日。繳費日與生效日同日，遇小月夾到月底。
export function paymentDates(p: PolicySchedule, from: string, to: string): string[] {
  if (!p.effective) return [];
  const out: string[] = [];
  const interval = INTERVAL_MONTHS[p.freq];

  const limit = (d: string): boolean => {
    if (p.payEnd && d > p.payEnd) return false;
    if (!p.payEnd && p.payYears > 0 && d >= addMonthsYMD(p.effective, p.payYears * 12)) return false;
    if (p.maturity && d > p.maturity) return false;
    return true;
  };

  if (!interval) {
    // 躉繳：只有生效日那一次
    return p.effective >= from && p.effective <= to && limit(p.effective) ? [p.effective] : [];
  }
  for (let i = 0; ; i++) {
    const d = addMonthsYMD(p.effective, i * interval, Number(p.effective.slice(8, 10)));
    if (d > to || !limit(d)) break;
    if (d >= from) out.push(d);
    if (i > 12 * 80) break; // 保險絲：最多往後 80 年
  }
  return out;
}
