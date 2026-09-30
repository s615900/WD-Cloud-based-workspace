import type { Metadata } from "next";

export const metadata: Metadata = { title: "無權限" };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <p className="text-[15px] leading-relaxed">此帳號無權限使用。</p>
    </div>
  );
}
