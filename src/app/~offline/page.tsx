import type { Metadata } from "next";

export const metadata: Metadata = { title: "目前離線" };

// 沒有網路時，service worker 會顯示這一頁（build 時預快取）。靜態頁，不需要登入。
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 pt-[max(24px,env(safe-area-inset-top))] text-center">
      <div className="text-5xl" aria-hidden>
        📡
      </div>
      <h1 className="text-xl font-bold text-navy">目前沒有網路</h1>
      <p className="max-w-[320px] text-[15px] leading-relaxed text-muted">
        行程、待辦等資料需要連線才能讀取。請確認 Wi-Fi 或行動網路後再試一次。
      </p>
      <a className="btn btn-primary" href="/desktop">
        重新載入
      </a>
    </div>
  );
}
