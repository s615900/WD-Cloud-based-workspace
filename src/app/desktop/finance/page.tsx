import { redirect } from "next/navigation";

// 已併入人事財務表總頁
export default function FinancePage() {
  redirect("/desktop/hr-finance?tab=finance");
}
