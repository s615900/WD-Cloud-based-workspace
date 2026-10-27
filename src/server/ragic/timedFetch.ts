// 所有 Ragic 請求共用的 fetch 包裝：量測每次花費的毫秒數並寫進 log（Vercel Logs 搜尋 [ragic]），
// 以及讀取結果的短暫記憶體快取。網址裡的 APIKey 不會出現在 log。
//
// 快取只在「同一個 Function 實例」內有效；任何寫入（非 GET）都會清掉全部快取，
// 其他實例最多讀到 TTL 秒前的資料，所以 TTL 刻意設得很短。

export async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const started = Date.now();
  let status: number | string = "ERR";
  try {
    const res = await fetch(url, init);
    status = res.status;
    return res;
  } finally {
    const { pathname } = new URL(url);
    console.log(`[ragic] ${method} ${pathname} ${Date.now() - started}ms status=${status}`);
    if (method !== "GET") clearRagicCache();
  }
}

const store = new Map<string, { at: number; promise: Promise<unknown> }>();

export function clearRagicCache(): void {
  store.clear();
}

// 同 key 在 ttlMs 內只送一次請求（含進行中的請求，所以同一個畫面並行打的多支 API 只會讀一次）。
// fresh = true 時略過舊結果直接重讀（會寫入資料的流程要用，確保讀到最新）。
export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = load();
  store.set(key, { at: Date.now(), promise });
  // 失敗的結果不留在快取裡
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });
  return promise;
}
