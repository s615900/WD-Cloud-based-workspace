// 分享／預約頁（給外部的人看的公開頁面）共用的深藍色頁首＋弧形底邊
export function PublicHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <header className="bg-navy px-5 pt-[calc(env(safe-area-inset-top)+26px)] pb-[26px] text-white">
        <h1 className="mb-1.5 text-xl font-bold">{title}</h1>
        <p className="text-[13.5px] opacity-80">{subtitle}</p>
      </header>
      <svg className="block h-[26px] w-full" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="M0,0 L100,0 L100,4 Q50,30 0,4 Z" className="fill-navy" />
      </svg>
    </>
  );
}

export function DayBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(11,61,92,0.08)]">
      <h2 className="mb-2.5 text-[15px] font-bold">{title}</h2>
      {children}
    </div>
  );
}

export function CenterNote({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-12 text-center text-sm text-muted">{children}</p>;
}
