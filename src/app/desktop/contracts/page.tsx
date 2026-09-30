import type { Metadata } from "next";
import { ContractsView } from "./ContractsView";

export const metadata: Metadata = { title: "合約" };

export default function ContractsPage() {
  return <ContractsView />;
}
