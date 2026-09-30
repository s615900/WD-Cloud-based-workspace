import type { Metadata } from "next";
import { QuoteForm } from "../QuoteForm";

export const metadata: Metadata = { title: "新增報價單" };

export default function NewQuotePage() {
  return <QuoteForm editId={null} />;
}
