import type { Metadata } from "next";
import { SignDocument } from "@/components/public/SignDocument";

export const metadata: Metadata = { title: { absolute: "合約確認 / 簽署" } };

export default async function ContractSignPage({ searchParams }: PageProps<"/contract-sign">) {
  const { token } = await searchParams;
  return <SignDocument kind="contract" token={typeof token === "string" ? token : ""} />;
}
