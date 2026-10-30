import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanView } from "../plan/PlanView";
import { HrView } from "../hr/HrView";

export const metadata: Metadata = { title: "人事" };

// 人事財務表總頁：預排班／人事假勤放在同一頁用分頁切換，用 ?tab= 記住目前分頁
// （舊的 /desktop/plan、/hr 網址會導到這裡；財務已獨立成 /desktop/finance，舊的 ?tab=finance 會轉過去）。
const TABS = [
  { key: "plan", label: "預排班", View: PlanView },
  { key: "hr", label: "人事假勤", View: HrView },
] as const;

export default async function HrFinancePage({ searchParams }: PageProps<"/desktop/hr-finance">) {
  const { tab } = await searchParams;
  if (tab === "finance") redirect("/desktop/finance");
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const View = current.View;

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="人事分頁">
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
