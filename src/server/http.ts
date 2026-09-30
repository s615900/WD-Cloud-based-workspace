// Route Handler 共用小工具：取代原本 Express 的 res.status().json()、req.body 解析，
// 以及各商業模組路由最前面那段「模組鎖定就直接回 423」的中介層。
import { NextResponse } from "next/server";
import { BUSINESS_MODULE_LOCKS, type BusinessModuleKey } from "./lib/businessLock";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

// 原本 express.json() 解析不到（沒帶 body／不是 JSON）時 req.body 會是空的，
// 這裡統一回傳空物件，讓後面的欄位驗證照常回 400，而不是直接噴 500。
export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body: unknown = await req.json();
    return (body && typeof body === "object" ? body : {}) as T;
  } catch {
    return {} as T;
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// 接案商業模組鎖定時，完全不打 Ragic，直接回錯誤擋在最前面。沒鎖定回傳 null。
export function lockedResponse(key: BusinessModuleKey): NextResponse | null {
  if (BUSINESS_MODULE_LOCKS[key]) {
    return json({ error: "接案商業功能目前暫停使用" }, 423);
  }
  return null;
}

// 回傳 yyyy-MM-dd 驗證用 querystring 值：沒帶回傳 undefined，保持跟 Express req.query 相同語意。
export function queryParam(req: Request, key: string): string | undefined {
  const value = new URL(req.url).searchParams.get(key);
  return value === null ? undefined : value;
}
