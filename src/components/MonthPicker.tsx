"use client";

// 月份下拉選單（年＋月兩個選單）：各處月曆除了「上月／下月」按鈕，也能直接選年月跳過去。
// 刻意不用 <input type="month">：桌面版 Safari 不支援，會變成要手打的文字框。
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function MonthPicker({
  value,
  onChange,
  className = "input",
  yearsBack = 5,
  yearsAhead = 5,
}: {
  value: string; // yyyy-MM
  onChange: (month: string) => void;
  className?: string;
  yearsBack?: number;
  yearsAhead?: number;
}) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const thisYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric" }).format(new Date()));
  const first = Math.min(thisYear - yearsBack, year);
  const last = Math.max(thisYear + yearsAhead, year);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        className={className}
        style={{ width: "auto", paddingTop: 9, paddingBottom: 9, fontWeight: 600 }}
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${pad(month)}`)}
        aria-label="選擇年份"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y} 年
          </option>
        ))}
      </select>
      <select
        className={className}
        style={{ width: "auto", paddingTop: 9, paddingBottom: 9, fontWeight: 600 }}
        value={month}
        onChange={(e) => onChange(`${year}-${pad(Number(e.target.value))}`)}
        aria-label="選擇月份"
      >
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m} 月
          </option>
        ))}
      </select>
    </span>
  );
}
