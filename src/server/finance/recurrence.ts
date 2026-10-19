// 定期收支規則：判斷某一天是不是規則的執行日。純函式，不碰 Ragic。
//   每月：每月執行日；每 N 月：從開始日的月份起每隔 N 個月；每年：開始日的月份、每年一次
//   每週：執行日＝星期幾（1 = 週一 … 7 = 週日），從開始日那週起每隔 N 週
// 執行日 29–31 遇小月自動夾到月底；日期都在 [開始日, 結束日] 之內。

import { clampYMD, daysBetween, monthsBetween, weekdayOf } from "./dateUtil.ts";

export interface RuleSchedule {
  freq: string; // 每月／每週／每年／每N月
  intervalN: number;
  day: number; // 每月／每年＝幾號；每週＝星期幾
  start: string;
  end: string; // 空字串＝無結束日
}

export const RULE_FREQ_LABELS = { month: "每月", week: "每週", year: "每年", nMonth: "每N月" } as const;

export function occursOn(rule: RuleSchedule, date: string): boolean {
  if (!rule.start || date < rule.start) return false;
  if (rule.end && date > rule.end) return false;

  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startDay = Number(rule.start.slice(8, 10));
  const day = rule.day >= 1 ? rule.day : startDay;
  const n = Math.max(1, rule.intervalN || 1);
  const L = RULE_FREQ_LABELS;

  if (rule.freq === L.week) {
    const weekday = rule.day >= 1 && rule.day <= 7 ? rule.day : weekdayOf(rule.start);
    if (weekdayOf(date) !== weekday) return false;
    return Math.floor(daysBetween(rule.start, date) / 7) % n === 0;
  }

  const diff = monthsBetween(rule.start.slice(0, 7), date.slice(0, 7));
  if (diff < 0) return false;
  if (date !== clampYMD(y, m, day)) return false;

  if (rule.freq === L.month) return true;
  if (rule.freq === L.nMonth) return diff % n === 0;
  if (rule.freq === L.year) return Number(rule.start.slice(5, 7)) === m;
  return false;
}
