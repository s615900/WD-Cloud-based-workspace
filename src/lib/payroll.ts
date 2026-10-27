// 預排班的工時與薪資計算（純函式，前後端共用，有單元測試 payroll.test.ts）。
// 規則：工時 = 結束 − 開始（結束 ≤ 開始視為跨日，例如 22:00–06:00）− 不計薪的休息分鐘；
// 薪資 = 計薪分鐘 ÷ 60 × 時薪（雙倍日 ×2），每筆班四捨五入到整數元，月薪資是各筆加總（跟薪資單逐筆對得起來）。

export interface PayrollShift {
  start: string; // HH:mm
  end: string; // HH:mm
  breakMin: number;
  rate: number;
  double?: boolean; // 雙倍日：這班薪資 ×2（工時不變）
}

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 開始到結束的總分鐘；結束 ≤ 開始 → 跨日。開始 = 結束視為 0（不是 24 小時，避免誤填變成整天）
export function spanMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e === s) return 0;
  return e > s ? e - s : e + 24 * 60 - s;
}

export function paidMinutes(shift: Pick<PayrollShift, "start" | "end" | "breakMin">): number {
  return Math.max(0, spanMinutes(shift.start, shift.end) - Math.max(0, shift.breakMin || 0));
}

export function shiftPay(shift: PayrollShift): number {
  return Math.round((paidMinutes(shift) * (shift.rate || 0) * (shift.double ? 2 : 1)) / 60);
}

// 分鐘 → 小時文字，最多兩位小數且去掉多餘的 0：450 → "7.5"、480 → "8"、400 → "6.67"
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

export interface PayrollGroup {
  key: string;
  label: string;
  count: number;
  minutes: number;
  pay: number;
}

export interface PayrollSummary {
  count: number;
  minutes: number;
  pay: number;
  groups: PayrollGroup[];
}

// 依 groupOf 分組加總（預排班頁用班別當組）；groups 依第一次出現順序排列
export function summarize<T extends PayrollShift>(
  shifts: T[],
  groupOf: (s: T) => { key: string; label: string },
): PayrollSummary {
  const map = new Map<string, PayrollGroup>();
  let minutes = 0;
  let pay = 0;
  for (const s of shifts) {
    const { key, label } = groupOf(s);
    const g = map.get(key) ?? { key, label, count: 0, minutes: 0, pay: 0 };
    const m = paidMinutes(s);
    const p = shiftPay(s);
    g.count += 1;
    g.minutes += m;
    g.pay += p;
    map.set(key, g);
    minutes += m;
    pay += p;
  }
  return { count: shifts.length, minutes, pay, groups: [...map.values()] };
}
