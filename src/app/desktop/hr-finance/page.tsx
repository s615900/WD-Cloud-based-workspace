import type { Metadata } from "next";
import Link from "next/link";
import { PlanView } from "../plan/PlanView";
import { HrView } from "../hr/HrView";
import { FinanceView } from "../finance/FinanceView";

export const metadata: Metadata = { title: "人事財務表" };

// 人事財務表總頁：預排班／人事假勤／財務放在同一頁用分頁切換，
// 用 ?tab= 記住目前分頁（舊的 /desktop/plan、/hr、/finance 網址會導到這裡）。
const TABS = [
  { key: "plan", label: "預排班", View: PlanView },
  { key: "hr", label: "人事假勤", View: HrView },
  { key: "finance", label: "財務", View: FinanceView },
] as const;

export default async function HrFinancePage({ searchParams }: PageProps<"/desktop/hr-finance">) {
  const { tab } = await searchParams;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const View = current.View;

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="人事財務表分頁">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/desktop/hr-finance?tab=${t.key}`}
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
