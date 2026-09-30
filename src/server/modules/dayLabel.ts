// 原本放在 routes/calendar.ts 的 formatDayLabel，webhook／book／share 都會用到，獨立出來。
const WEEKDAY_MAP: Record<string, string> = {
  Sun: "日",
  Mon: "一",
  Tue: "二",
  Wed: "三",
  Thu: "四",
  Fri: "五",
  Sat: "六",
};

export function formatDayLabel(date: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(`${date}T00:00:00+08:00`));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}月${get("day")}日（${WEEKDAY_MAP[get("weekday")] ?? ""}）`;
}
