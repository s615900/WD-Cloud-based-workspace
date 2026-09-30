import type { Metadata } from "next";
import { ContractDetailView } from "./ContractDetailView";

export const metadata: Metadata = { title: "合約詳情" };

export default async function ContractDetailPage({ params }: PageProps<"/desktop/contracts/[id]">) {
  const { id } = await params;
  return <ContractDetailView id={id} />;
}
