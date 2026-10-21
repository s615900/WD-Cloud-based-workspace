import { redirect } from "next/navigation";

// 已併入人事財務表總頁
export default function HrPage() {
  redirect("/desktop/hr-finance?tab=hr");
}
