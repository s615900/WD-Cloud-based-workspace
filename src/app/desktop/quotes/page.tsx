import type { Metadata } from "next";
import { QuotesView } from "./QuotesView";

export const metadata: Metadata = { title: "報價單" };

export default function QuotesPage() {
  return <QuotesView />;
}
