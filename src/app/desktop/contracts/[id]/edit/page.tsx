import type { Metadata } from "next";
import { ContractForm } from "../../ContractForm";

export const metadata: Metadata = { title: "編輯合約" };

export default async function EditContractPage({ params }: PageProps<"/desktop/contracts/[id]/edit">) {
  const { id } = await params;
  return <ContractForm editId={id} />;
}
