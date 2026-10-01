import type { Metadata } from "next";

export const metadata: Metadata = { title: "已登出" };

export default function LoggedOutPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-[15px] leading-relaxed">已登出。</p>
      {/* /auth/login 是 Route Handler（會轉去 LINE Login），用一般連結整頁跳轉 */}
      <a className="btn btn-outline" href="/auth/login">
        重新登入
      </a>
    </div>
  );
}
