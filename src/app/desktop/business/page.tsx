import type { Metadata } from "next";
import Link from "next/link";
import { ClientsView } from "../clients/ClientsView";
import { QuotesView } from "../quotes/QuotesView";
import { ContractsView } from "../contracts/ContractsView";
import { ProjectsView } from "../projects/ProjectsView";

export const metadata: Metadata = { title: "接案商業" };

// 接案商業總頁：客戶資料／報價單／合約／專案進度四個系統放在同一頁用分頁切換，
// 用 ?tab= 記住目前分頁（舊的 /desktop/clients 等列表網址會導到這裡）。
const TABS = [
  { key: "clients", label: "客戶資料", View: ClientsView },
  { key: "quotes", label: "報價單", View: QuotesView },
  { key: "contracts", label: "合約", View: ContractsView },
  { key: "projects", label: "專案進度", View: ProjectsView },
] as const;

export default async function BusinessPage({ searchParams }: PageProps<"/desktop/business">) {
  const { tab } = await searchParams;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const View = current.View;

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="接案商業分頁">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/desktop/business?tab=${t.key}`}
            aria-current={t.key === current.key ? "page" : undefined}
            className={`btn ${t.key === current.key ? "btn-primary" : "btn-outline"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <View />
    </>
  );
}
