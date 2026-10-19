import { json } from "@/server/http";
import { getSettings } from "@/server/finance/entities";
import { handle } from "@/server/finance/route";

// 只讀：每日引擎的上次執行日
export function GET() {
  return handle("讀取財務設定", async () => json(await getSettings()));
}
