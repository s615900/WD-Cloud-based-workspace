// 所有 Ragic 請求共用的 fetch 包裝：量測每次花費的毫秒數並寫進 log（Vercel Logs 搜尋 [ragic]），
// 以及讀取結果的快取。網址裡的 APIKey 不會出現在 log。
//
// 快取分兩層：
// 1. 跨實例共用的 Next 資料快取（unstable_cache，tag = ragic-read）：Vercel 會同時開多個 Function 實例，
//    共用同一份，任何寫入（非 GET）都用 tag 立刻清掉，所以不會再出現「Ragic 已經刪了、別台實例還讀到舊的」。
//    財務表（finance/ragic.ts）有自己的 tag，做法相同。
// 2. 同一實例內只留 2 秒的記憶體快取，單純讓同一個畫面並行打的多支 API 只送一次請求；
//    時間刻意很短，因為它不會被其他實例的寫入清掉。
import { revalidateTag, unstable_cache } from "next/cache";

const SHARED_TAG = "ragic-read";
const MEMORY_TTL_MS = 2_000;

export async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const started = Date.now();
  let status: number | string = "ERR";
  try {
    // 讀取一律不走 Next 的 fetch 快取：快取統一由下面的 sharedRead／cachedRead 管，才清得乾淨
    const res = await fetch(url, method === "GET" ? { cache: "no-store", ...init } : init);
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
  // 同時清掉各實例共用的資料快取；不在 Next 請求範圍內（例如腳本、測試）時略過
  try {
    revalidateTag(SHARED_TAG, { expire: 0 });
  } catch {
    // ignore
  }
}

// 跨實例共用的讀取。不在 Next 執行環境（例如 node --test）時沒有資料快取，直接讀。
async function sharedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(load, ["ragic-read", key], {
      revalidate: Math.max(1, Math.round(ttlMs / 1000)),
      tags: [SHARED_TAG],
    })();
  } catch (err) {
    if (err instanceof Error && /incrementalCache/i.test(err.message)) return load();
    throw err;
  }
}

// 同 key 在 ttlMs 內（跨實例共用）只送一次請求；寫入時整批清掉。
// fresh = true 時略過所有快取直接重讀（會「讀了再寫」的流程要用，確保讀到最新）。
export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.promise as Promise<T>;
  const promise = fresh ? load() : sharedRead(key, ttlMs, load);
  store.set(key, { at: Date.now(), promise });
  // 失敗的結果不留在快取裡
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });
  return promise;
}
