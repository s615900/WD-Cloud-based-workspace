import { json, readBody } from "@/server/http";
import { handle, handleWrite } from "@/server/finance/route";
import { listBudgets, setBudget } from "@/server/finance/service";

export function GET() {
  return handle("讀取預算", async () => json(await listBudgets()));
}

// 設定單一對象的每月預算；amount 留空或 0＝取消
export function POST(req: Request) {
  return handleWrite("設定預算", async () => {
    await setBudget(await readBody<{ target?: unknown; amount?: unknown }>(req));
    return json({ success: true });
  });
}
