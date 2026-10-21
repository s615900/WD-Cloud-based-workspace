"use client";

// 導覽列：所有 /desktop/* 頁面共用（掛在 app/desktop/layout.tsx）。
// 桌面（≥ 1024px）是上方導覽列；平板／手機（< 1024px）是可開合的抽屜：漢堡按鈕＋背景遮罩。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// external：外部網站書籤，另開新分頁；also：這些路徑底下的頁面也算在這一項（例如報價單詳情頁）
type NavItem = { href: string; label: string; external?: boolean; also?: string[] };

// 上方列直接攤開的項目
const MAIN_ITEMS: NavItem[] = [
  { href: "/desktop", label: "首頁" },
  { href: "/desktop/calendar", label: "行事曆" },
  { href: "/desktop/tasks", label: "待辦事項" },
  { href: "/desktop/finance", label: "財務" },
  {
    href: "/desktop/business",
    label: "接案商業",
    also: ["/desktop/clients", "/desktop/quotes", "/desktop/contracts", "/desktop/projects"],
  },
];
// 下拉分類
const DROP_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "班表",
    items: [
      { href: "/desktop/plan", label: "預排班" },
      { href: "/desktop/hr", label: "人事假勤" },
    ],
  },
  {
    label: "網站管理",
    items: [
      { href: "https://qsprint-tw.vercel.app/", label: "官網", external: true },
      { href: "https://qsprint-tw.vercel.app/admin", label: "官網後台", external: true },
      { href: "https://event-management-qsprint.vercel.app/", label: "賽事登記", external: true },
      { href: "https://event-management-qsprint.vercel.app/admin", label: "賽事登記後台", external: true },
      { href: "https://national-games-lyart.vercel.app/", label: "全台灣運動攝影師作品平台", external: true },
    ],
  },
];
const SETTINGS: NavItem = { href: "/desktop/settings", label: "設定" };
// 手機抽屜：分組標題＋項目
const DRAWER_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "總覽", items: MAIN_ITEMS },
  ...DROP_GROUPS,
  { label: "系統", items: [SETTINGS] },
];

function isActive(pathname: string, href: string, also: string[] = []): boolean {
  if (href === "/desktop") return pathname === "/desktop";
  return [href, ...also].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

// 內部頁面用 Link；外部書籤用 <a> 另開分頁
function NavLink({ item, className, onClick }: { item: NavItem; className: string; onClick?: () => void }) {
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {item.label} <span className="text-[10px] opacity-60">↗</span>
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onClick}>
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const topLink = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm whitespace-nowrap no-underline ${
      active ? "bg-navy-2 font-bold text-white" : "text-white/85 hover:bg-white/8"
    }`;

  return (
    <>
      {/* 桌面上方導覽列：項目在左，標題靠右 */}
      <nav className="sticky top-0 z-[60] flex items-center bg-navy px-6 py-2 text-white max-lg:hidden">
        <div className="flex items-center gap-1">
          {MAIN_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={topLink(isActive(pathname, item.href, item.also))}>
              {item.label}
            </Link>
          ))}
          {DROP_GROUPS.map((group) => {
            const groupActive = group.items.some((it) => !it.external && isActive(pathname, it.href));
            return (
              <div
                key={group.label}
                className="relative"
                onMouseEnter={() => setDropdown(group.label)}
                onMouseLeave={() => setDropdown(null)}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={dropdown === group.label}
                  className={`cursor-pointer border-0 bg-transparent ${topLink(groupActive)}`}
                  onClick={() => setDropdown(dropdown === group.label ? null : group.label)}
                >
                  {group.label} <span className="text-[10px] opacity-70">▾</span>
                </button>
                {dropdown === group.label ? (
                  <div className="absolute left-0 top-full min-w-[160px] rounded-lg bg-navy p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        onClick={() => setDropdown(null)}
                        className={`block ${topLink(!item.external && isActive(pathname, item.href))}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          <Link href={SETTINGS.href} className={topLink(isActive(pathname, SETTINGS.href))}>
            {SETTINGS.label}
          </Link>
        </div>
        <span className="ml-auto text-lg font-bold tracking-wide">WD＿個人工作台</span>
      </nav>

      {/* 手機／平板頂列（漢堡選單），桌面寬度隱藏 */}
      <div className="sticky top-0 z-[60] hidden items-center gap-3 bg-navy px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] text-white max-lg:flex">
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
        {DRAWER_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-2 pb-2 text-[11px] font-bold tracking-[0.08em] text-white/55 uppercase">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                onClick={() => setOpen(false)}
                className={`mb-0.5 block rounded-lg px-2.5 py-[9px] text-sm no-underline ${
                  !item.external && isActive(pathname, item.href, item.also) ? "bg-navy-2 font-bold text-white" : "text-white/85 hover:bg-white/8"
                }`}
              />
            ))}
          </div>
        ))}
      </aside>
    </>
  );
}
