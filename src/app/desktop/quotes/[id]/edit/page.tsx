import type { Metadata } from "next";
import { QuoteForm } from "../../QuoteForm";

export const metadata: Metadata = { title: "編輯報價單" };

export default async function EditQuotePage({ params }: PageProps<"/desktop/quotes/[id]/edit">) {
  const { id } = await params;
  return <QuoteForm editId={id} />;
}
