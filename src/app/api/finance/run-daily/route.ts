import { json, queryParam } from "@/server/http";
import { runDaily } from "@/server/finance/daily";
import { handle } from "@/server/finance/route";
import { DATE_RE } from "@/server/modules/dates";

// 手動觸發每日引擎（登入後使用）。?dryRun=1 只回傳將產生的內容，不寫入、不推播。
// 排程用的版本是 /api/cron/finance-daily（用 CRON_SECRET 驗證，給 cron-job.org 打）。
// ?today=yyyy-MM-dd 模擬「那一天」執行：只有 dryRun（唯讀預覽）或非 production（開發測試）才生效。
export function POST(req: Request) {
  return handle("每日引擎", async () => {
    const dryRun = queryParam(req, "dryRun") === "1";
    const asked = queryParam(req, "today");
    const today = asked && DATE_RE.test(asked) && (dryRun || process.env.NODE_ENV !== "production") ? asked : undefined;
    // ?push=0 正式寫入但不推播 LINE（測試用）
    return json(await runDaily({ dryRun, today, push: queryParam(req, "push") !== "0" }));
  });
}
