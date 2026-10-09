/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// 這些路徑一律直接走網路、絕不進快取：API、登入／登出、LINE webhook、排程、本檔自己。
// 避免看到過期資料，也避免登出後別人在同一支手機看到上一個人的內容。
const NEVER_CACHE = /^\/(api|auth|webhook|serwist)(\/|$)/;

const runtimeCaching: RuntimeCaching[] = [
  // 1) 不快取的請求（放最前面，先比對先贏）
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && NEVER_CACHE.test(url.pathname),
    handler: new NetworkOnly(),
  },
  // 2) 靜態檔：檔名帶 hash（/_next/static/）內容永遠不變 → 快取優先
  //    （平常已由預快取處理，這裡是預快取沒收到的備援）
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({ cacheName: "static-assets" }),
  },
  // 3) 圖示與字型：先給舊的、背景更新
  {
    matcher: ({ sameOrigin, request, url }) =>
      sameOrigin && (url.pathname.startsWith("/icons/") || request.destination === "image" || request.destination === "font"),
    handler: new StaleWhileRevalidate({ cacheName: "static-images" }),
  },
  // 4) 頁面：一律先走網路。離線（或連線失敗）時由下面的 fallbacks 顯示 /~offline。
  //    刻意不把 /desktop 這類個人頁面存進快取：裡面是行程、客戶、報價、人事資料，
  //    不應該躺在手機快取裡，登出後也不會殘留。
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // 新版 service worker 安裝完立刻接手，不用等所有分頁關閉（避免卡在舊版）
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// ── Web Push ────────────────────────────────────────────────────
// iOS 規定：收到 push 一定要顯示通知（不能發靜默推播），否則系統會撤銷訂閱。
interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "生活記事", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/desktop" },
    }),
  );
});

// 點擊通知：App 已經開著就切過去並導到對應頁面，沒開就開新視窗
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url || "/desktop", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        try {
          await existing.navigate(target);
          return;
        } catch {
          // 有些瀏覽器不允許 navigate，退回開新視窗
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
