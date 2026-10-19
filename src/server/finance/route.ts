// /api/finance/* 路由共用：FinanceError → 對應狀態碼的中文錯誤，其他例外 → 500。
import { errorMessage, json } from "@/server/http";
import { withFresh } from "./ragic";
import { FinanceError, isRecordId } from "./service";

export async function handle(label: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FinanceError) return json({ success: false, error: err.message }, err.status);
    console.error(`${label}失敗:`, err);
    return json({ success: false, error: errorMessage(err, `${label}失敗`) }, 500);
  }
}

// 紀錄編號 0 是有效值，用格式判斷，不用 falsy
export function badRecordId(id: string): Response | null {
  return isRecordId(id) ? null : json({ success: false, error: "id 格式錯誤" }, 400);
}

// POST／PATCH／DELETE 用：整個流程繞過讀取快取（見 ragic.ts），驗證與防重複才會讀到最新資料
export function handleWrite(label: string, fn: () => Promise<Response>): Promise<Response> {
  return handle(label, () => withFresh(fn));
}
