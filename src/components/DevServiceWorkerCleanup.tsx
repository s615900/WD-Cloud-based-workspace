"use client";

import { useEffect } from "react";

// 本機開發（npm run dev）專用：把之前註冊過的 service worker 與它的快取全部清掉。
// 不然 service worker 會一直用舊的程式檔，改了程式、重新整理還是看到舊畫面。
// 清完若有真的清到東西，自動重新整理一次。正式環境不會載入這個元件。
export function DevServiceWorkerCleanup() {
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      const keys = await caches.keys();
      if (regs.length === 0 && keys.length === 0) return;
      await Promise.all(regs.map((r) => r.unregister()));
      await Promise.all(keys.map((k) => caches.delete(k)));
      location.reload();
    })().catch(() => {});
  }, []);
  return null;
}
