import type { Metadata } from "next";
import { FinanceView } from "./FinanceView";

export const metadata: Metadata = { title: "財務" };

export default function FinancePage() {
  return <FinanceView />;
}
