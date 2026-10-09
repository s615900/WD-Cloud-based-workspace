import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "個人工作台",
    template: "%s - 個人工作台",
  },
  // 網站圖示用 app/favicon.ico、app/icon.png、app/apple-icon.png（Next.js 檔案慣例自動產生 <link>，
  // apple-icon.png 就是 iPhone「加入主畫面」用的 apple-touch-icon，180x180）
  manifest: "/manifest.json",
  applicationName: "生活記事",
  // iPhone「加入主畫面」：全螢幕開啟、主畫面圖示下的名稱。
  // 狀態列用 black（黑底白字、內容從狀態列下方開始）：black-translucent 會讓頁面延伸到狀態列後面，
  // iOS 會在那一塊疊一層半透明漸層，顏色與時間字色都無法用網頁樣式控制。
  appleWebApp: {
    capable: true,
    title: "生活記事",
    statusBarStyle: "black",
  },
  // 不要把頁面上的數字自動變成電話連結
  formatDetection: { telephone: false },
  // Next 預設只輸出新版的 mobile-web-app-capable；舊版 iOS 看的是 apple- 開頭這個，兩個都留
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#0B3D5C",
  // 讓畫面延伸到瀏海與底部 Home 橫條後面；內容避開的部分用 env(safe-area-inset-*) 處理
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant">
      <body>
        {/* 快取策略在 src/app/sw.ts；關掉「換頁自動快取」與「恢復連線自動重整」：
            前者會把登入後的個人頁面存進快取，後者會讓填到一半的表單被重整掉 */}
        <SerwistProvider swUrl="/serwist/sw.js" cacheOnNavigation={false} reloadOnOnline={false}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
