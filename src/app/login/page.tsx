import type { Metadata } from "next";

export const metadata: Metadata = { title: "登入" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 pt-[max(24px,env(safe-area-inset-top))] text-center">
      <p className="text-[15px] leading-relaxed">請選擇登入方式</p>
      {/* /auth/* 是 Route Handler（會轉去 LINE／Google），用一般連結整頁跳轉 */}
      <a className="btn btn-outline" href="/auth/login">
        使用 LINE 登入
      </a>
      <a className="btn btn-outline" href="/auth/google">
        使用 Google 登入
      </a>
    </div>
  );
}
