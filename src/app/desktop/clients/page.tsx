import type { Metadata } from "next";
import { ClientsView } from "./ClientsView";

export const metadata: Metadata = { title: "客戶資料" };

export default function ClientsPage() {
  return <ClientsView />;
}
