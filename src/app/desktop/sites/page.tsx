import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "網站管理" };

// 外部網站書籤：另開新分頁
const SITES = [
  { href: "https://qsprint-tw.vercel.app/", label: "官網" },
  { href: "https://qsprint-tw.vercel.app/admin", label: "官網後台" },
  { href: "https://event-management-qsprint.vercel.app/", label: "賽事登記" },
  { href: "https://event-management-qsprint.vercel.app/admin", label: "賽事登記後台" },
  { href: "https://national-games-lyart.vercel.app/", label: "全台灣運動攝影師作品平台" },
];

export default function SitesPage() {
  return (
    <>
      <PageHeader title="網站管理" subtitle="外部網站與後台的快速入口（另開新分頁）" />
      <div className="flex flex-wrap gap-3">
        {SITES.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className="btn btn-outline no-underline">
            {s.label} <span className="text-[10px] opacity-60">↗</span>
          </a>
        ))}
      </div>
    </>
  );
}
