// 最基本的離線快取：全部走 network-first，離線時才退回快取。不快取 /api/* 資料，不監聽 push 事件
//
// 之前非 navigate 的請求（例如 /desktop/nav.js、common.js、desktop.css 這些共用靜態檔）
// 走的是 cache-first，而且 CACHE_NAME 版本沒有隨每次部署更動——結果是任何瀏覽器只要
// 曾經載入過一次，之後這些檔案不管伺服器內容怎麼改都會一直被快取擋住，永遠拿不到新版
// （這正是側邊欄改版後使用者仍看到舊連結的成因，不是部署沒成功）。
// 這裡改成全部走 network-first，跟 HTML 導覽請求同一套邏輯：只要能連上網路就一定拿新版，
// 快取只在離線時當退路用。同時把 CACHE_NAME 版本號往上跳一版，讓已經裝上舊版 Service
// Worker 的瀏覽器，下次偵測到新版 sw.js 並啟用後，activate 階段會把舊快取整個清掉。
const CACHE_NAME = "life-notes-static-v4";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // API 資料一律走網路，不要快取到舊的待辦清單
  if (request.url.includes("/api/")) return;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
