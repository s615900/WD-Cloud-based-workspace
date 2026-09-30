import type { Metadata } from "next";
import { QuoteDetailView } from "./QuoteDetailView";

export const metadata: Metadata = { title: "報價單詳情" };

export default async function QuoteDetailPage({ params }: PageProps<"/desktop/quotes/[id]">) {
  const { id } = await params;
  return <QuoteDetailView id={id} />;
}
