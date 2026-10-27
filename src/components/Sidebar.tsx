"use client";

// 導覽列：所有 /desktop/* 頁面共用（掛在 app/desktop/layout.tsx）。
// 桌面（≥ 1024px）是上方導覽列；平板／手機（< 1024px）是可開合的抽屜：漢堡按鈕＋背景遮罩。
// 每一項都是單一按鈕，點下去進對應頁面（時間線、人事財務表、財務、網站管理、接案商業是各自的總頁）。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// also：這些路徑底下的頁面也算在這一項（例如報價單詳情頁）
type NavItem = { href: string; label: string; also?: string[] };

const NAV_ITEMS: NavItem[] = [
  { href: "/desktop", label: "首頁" },
  { href: "/desktop/calendar", label: "行事曆" },
  { href: "/desktop/timeline", label: "時間線" },
  { href: "/desktop/tasks", label: "待辦事項" },
  { href: "/desktop/hr-finance", label: "人事財務表" },
  { href: "/desktop/finance", label: "財務" },
  { href: "/desktop/sites", label: "網站管理" },
  {
    href: "/desktop/business",
    label: "接案商業",
    also: ["/desktop/clients", "/desktop/quotes", "/desktop/contracts", "/desktop/projects"],
  },
];
const SETTINGS: NavItem = { href: "/desktop/settings", label: "設定" };
const ALL_ITEMS: NavItem[] = [...NAV_ITEMS, SETTINGS];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/desktop") return pathname === "/desktop";
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const topLink = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm whitespace-nowrap no-underline ${
      active ? "bg-navy-2 font-bold text-white" : "text-white/85 hover:bg-white/8"
    }`;

  return (
    <>
      {/* 桌面上方導覽列：項目在左，標題靠右 */}
      {/* iPad 橫放（≥ 1024px）也走這裡：頂列要墊 safe-area-inset-top 並有 3.5rem 內容高，
          才蓋得住「加入主畫面」時 iOS 在狀態列下疊的半透明漸層 */}
      <nav className="sticky top-0 z-[60] flex min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center bg-navy px-6 pt-[env(safe-area-inset-top)] text-white max-lg:hidden">
        <div className="flex items-center gap-1">
          {ALL_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={topLink(isActive(pathname, item))}>
              {item.label}
            </Link>
          ))}
        </div>
        <span className="ml-auto text-lg font-bold tracking-wide">WD＿個人工作台</span>
      </nav>

      {/* 手機／平板頂列（漢堡選單），桌面寬度隱藏 */}
      <div className="sticky top-0 z-[60] hidden min-h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 bg-navy px-4 pt-[env(safe-area-inset-top)] text-white max-lg:flex">
        <button
          type="button"
          aria-label="開啟選單"
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg bg-white/12 text-base"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <span className="text-[15px] font-bold">WD＿個人工作台</span>
      </div>

      <div
        className={`fixed inset-0 z-[70] hidden bg-[rgba(11,37,61,0.45)] transition-opacity max-lg:block ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* 手機抽屜：桌面寬度不顯示 */}
      <aside
        className={`fixed left-0 top-0 z-[80] hidden h-screen w-[248px] overflow-y-auto bg-navy px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-white shadow-[0_0_24px_rgba(0,0,0,0.25)] transition-transform max-lg:block ${
          open ? "" : "-translate-x-full"
        }`}
      >
        <div className="px-2 pb-5 text-lg font-bold tracking-wide">WD＿個人工作台</div>
        {ALL_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`mb-0.5 block rounded-lg px-2.5 py-[9px] text-sm no-underline ${
              isActive(pathname, item) ? "bg-navy-2 font-bold text-white" : "text-white/85 hover:bg-white/8"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </aside>
    </>
  );
}
