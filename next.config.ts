import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// 舊版 Express 時期的 .html 網址（已經寄給客戶的簽署連結、存在 Ragic 設定裡的預約連結、
// 書籤等）一律轉到新的 App Router 路徑，查詢參數（?token=、?id=、?date=）會原封不動帶過去。
const legacyDesktopPages = ["calendar", "tasks", "clients", "quotes", "contracts", "projects", "settings"];

const nextConfig: NextConfig = {
  // 開發模式允許同一個區網的手機連進來測試（例如客戶簽署頁）；正式環境不受影響
  allowedDevOrigins: ["192.168.0.105"],
  // service worker 檔案本身不能被 CDN／瀏覽器長期快取，否則新版部署後手機會一直拿到舊的 sw.js
  async headers() {
    return [
      {
        source: "/serwist/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: "/desktop/calendar", permanent: false },
      { source: "/desktop/index.html", destination: "/desktop", permanent: true },
      ...legacyDesktopPages.map((page) => ({
        source: `/desktop/${page}.html`,
        destination: `/desktop/${page}`,
        permanent: true,
      })),
      ...(["quotes", "contracts"] as const).flatMap((kind) => [
        {
          source: `/desktop/${kind}-detail.html`,
          has: [{ type: "query" as const, key: "id", value: "(?<id>\\d+)" }],
          destination: `/desktop/${kind}/:id`,
          permanent: true,
        },
        {
          source: `/desktop/${kind}-new.html`,
          has: [{ type: "query" as const, key: "id", value: "(?<id>\\d+)" }],
          destination: `/desktop/${kind}/:id/edit`,
          permanent: true,
        },
        { source: `/desktop/${kind}-new.html`, destination: `/desktop/${kind}/new`, permanent: true },
      ]),
      { source: "/book.html", destination: "/book", permanent: true },
      { source: "/share.html", destination: "/share", permanent: true },
      { source: "/quote-sign.html", destination: "/quote-sign", permanent: true },
      { source: "/contract-sign.html", destination: "/contract-sign", permanent: true },
      { source: "/no-access.html", destination: "/no-access", permanent: true },
    ];
  },
};

// PWA：service worker 由 src/app/serwist/[path]/route.ts 在 build 時產生（Turbopack 專用的 Serwist）
export default withSerwist(nextConfig);
