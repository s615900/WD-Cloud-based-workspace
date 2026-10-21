import { redirect } from "next/navigation";

// 列表已併入接案商業總頁
export default function QuotesPage() {
  redirect("/desktop/business?tab=quotes");
}
