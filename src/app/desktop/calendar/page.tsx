import type { Metadata } from "next";
import { CalendarView } from "./CalendarView";

export const metadata: Metadata = { title: "行事曆" };

// 待辦頁「檢視」排班行程會導來 ?date=yyyy-MM-dd，定位到那一天。
export default async function CalendarPage({ searchParams }: PageProps<"/desktop/calendar">) {
  const { date } = await searchParams;
  const initialDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  return <CalendarView initialDate={initialDate} />;
}
