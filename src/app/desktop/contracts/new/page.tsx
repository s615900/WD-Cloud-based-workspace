import type { Metadata } from "next";
import { ContractForm } from "../ContractForm";

export const metadata: Metadata = { title: "新增合約" };

export default function NewContractPage() {
  return <ContractForm editId={null} />;
}
