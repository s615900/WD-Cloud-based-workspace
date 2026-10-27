import type { Metadata } from "next";
import { FinanceView } from "./FinanceView";

export const metadata: Metadata = { title: "財務" };

// 個人財務：導覽列獨立一項（原本在人事財務表的分頁裡）
export default function FinancePage() {
  return <FinanceView />;
}
