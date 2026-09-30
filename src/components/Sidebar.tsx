"use client";

// 桌面版側邊欄：所有 /desktop/* 頁面共用（掛在 app/desktop/layout.tsx）。
// 窄螢幕（≤900px）變成可開合的抽屜：漢堡按鈕＋背景遮罩。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import type { BusinessModuleKey } from "@/lib/types";

const GROUPS: { label: string; items: { href: string; label: string; lockKey?: BusinessModuleKey }[] }[] = [
  {
    label: "總覽",
    items: [
      { href: "/desktop", label: "首頁" },
      { href: "/desktop/calendar", label: "行事曆" },
      { href: "/desktop/tasks", label: "待辦事項" },
    ],
  },
  {
    label: "接案商業",
    items: [
      { href: "/desktop/clients", label: "客戶資料", lockKey: "clients" },
      { href: "/desktop/quotes", label: "報價單", lockKey: "quotes" },
      { href: "/desktop/contracts", label: "合約", lockKey: "contracts" },
      { href: "/desktop/projects", label: "專案進度", lockKey: "projects" },
    ],
  },
  {
    label: "系統",
    items: [{ href: "/desktop/settings", label: "設定" }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/desktop") return pathname === "/desktop";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const locks = useBusinessLocks();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 手機／平板頂列（漢堡選單），桌面寬度隱藏 */}
      <div className="sticky top-0 z-[60] hidden items-center gap-3 bg-navy px-4 py-3 text-white max-[900px]:flex">
        <button
          type="button"
          aria-label="開啟選單"
          className="flex size-9 cursor-pointer items-center justify-center rounded-lg bg-white/12 text-lg"
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <span className="text-base font-bold">個人工作台</span>
      </div>

      <div
        className={`fixed inset-0 z-[70] hidden bg-[rgba(11,37,61,0.45)] transition-opacity max-[900px]:block ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`sticky top-0 h-screen w-[248px] flex-none overflow-y-auto bg-navy px-4 py-6 text-white max-[900px]:fixed max-[900px]:left-0 max-[900px]:z-[80] max-[900px]:shadow-[0_0_24px_rgba(0,0,0,0.25)] max-[900px]:transition-transform ${
          open ? "" : "max-[900px]:-translate-x-full"
        }`}
      >
        <div className="px-2 pb-5 text-lg font-bold tracking-wide">個人工作台</div>
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-2 pb-2 text-[11px] font-bold tracking-[0.08em] text-white/55 uppercase">{group.label}</div>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`mb-0.5 block rounded-lg px-2.5 py-[9px] text-sm no-underline ${
                    active ? "bg-navy-2 font-bold text-white" : "text-white/85 hover:bg-white/8"
                  }`}
                >
                  {item.label}
                  {/* 鎖頭圖示只是提示用，選單本身仍可以點進去看鎖定畫面 */}
                  {item.lockKey && locks?.[item.lockKey] ? (
                    <span className="ml-1 text-[11px] opacity-75" title="暫時鎖定">
                      🔒
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>
    </>
  );
}
