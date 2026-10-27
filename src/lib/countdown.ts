// 倒數日計算（純函式，前後端共用，有單元測試 countdown.test.ts）。
// 每年重複只照國曆：每年同月同日；2/29 在非閏年落在 2/28。

export interface CountdownInfo {
  date: string; // 下一次（或今天、或單次的）日期 yyyy-MM-dd
  daysLeft: number; // 0＝今天
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysBetween(from: string, to: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(to) - t(from)) / 86400000);
}

function onYear(date: string, year: number): string {
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${pad(m)}-${pad(Math.min(d, last))}`;
}

// 單次：日期已過回傳 null（不再顯示）；每年重複：回傳今天或之後最近一次
export function nextOccurrence(date: string, yearly: boolean, today: string): CountdownInfo | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let target = date;
  if (yearly) {
    const year = Number(today.slice(0, 4));
    target = onYear(date, year);
    if (target < today) target = onYear(date, year + 1);
  }
  const daysLeft = daysBetween(today, target);
  return daysLeft < 0 ? null : { date: target, daysLeft };
}
