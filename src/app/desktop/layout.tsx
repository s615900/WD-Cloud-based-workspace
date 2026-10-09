import { connection } from "next/server";
import { Sidebar } from "@/components/Sidebar";

// 桌面版個人工作台共用外框。登入保護由 src/proxy.ts 負責（/desktop/* 一律檢查 session）。
export default async function DesktopLayout({ children }: LayoutProps<"/desktop">) {
  // 頁面上有「今天」相關的內容（問候語、預設日期、月曆今日標示），每次請求都重新渲染，
  // 不要在 build 時預先產生成靜態頁（否則日期會停在 build 當天）。
  await connection();

  return (
    <div className="flex min-h-screen max-lg:min-h-0 max-lg:flex-col">
      <Sidebar />
      <main className="w-full max-w-[1280px] min-w-0 flex-1 px-10 pt-8 pb-16 max-md:px-4 md:max-lg:px-6 max-lg:pt-3 max-lg:pb-10">
        {children}
      </main>
    </div>
  );
}
