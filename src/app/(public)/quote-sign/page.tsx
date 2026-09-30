import type { Metadata } from "next";
import { SignDocument } from "@/components/public/SignDocument";

export const metadata: Metadata = { title: { absolute: "報價單確認 / 簽署" } };

export default async function QuoteSignPage({ searchParams }: PageProps<"/quote-sign">) {
  const { token } = await searchParams;
  return <SignDocument kind="quote" token={typeof token === "string" ? token : ""} />;
}
