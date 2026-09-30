// 重複排班批次建立：單次上限 120 筆，併發上限 3。
import { createSchedule, genScheduleCode, runWithConcurrency } from "@/server/ragic/schedule";
import { findTemplateByCode, getUserId } from "@/server/modules/roster";
import { DATE_RE } from "@/server/modules/dates";
import { json, readBody } from "@/server/http";

const MAX_REPEAT_COUNT = 120;
const REPEAT_CONCURRENCY = 3;

export async function POST(req: Request) {
  const body = await readBody<{ templateCode?: unknown; dates?: unknown }>(req);

  if (typeof body.templateCode !== "string" || !body.templateCode.trim()) {
    return json({ success: false, error: "templateCode 不可為空" }, 400);
  }
  if (!Array.isArray(body.dates) || body.dates.length === 0) {
    return json({ success: false, error: "dates 不可為空陣列" }, 400);
  }
  if (body.dates.length > MAX_REPEAT_COUNT) {
    return json({ success: false, error: `單次最多建立 ${MAX_REPEAT_COUNT} 筆` }, 400);
  }
  if (!body.dates.every((d): d is string => typeof d === "string" && DATE_RE.test(d))) {
    return json({ success: false, error: "dates 內每個日期格式須為 yyyy-MM-dd" }, 400);
  }
  const dates = body.dates as string[];

  const template = await findTemplateByCode(body.templateCode.trim());
  if (!template) {
    return json({ success: false, error: "找不到對應的班別模板" }, 400);
  }

  const batchId = genScheduleCode("BATCH");
  const userId = getUserId();
  const results: { date: string; id?: number; error?: string }[] = [];

  await runWithConcurrency(dates, REPEAT_CONCURRENCY, async (date) => {
    try {
      const id = await createSchedule({
        userId,
        kind: "班別",
        date,
        start: template.start,
        end: template.end,
        title: template.name,
        status: "正常",
        templateCode: template.code,
        batchId,
        color: template.color,
      });
      results.push({ date, id });
    } catch (err) {
      results.push({ date, error: err instanceof Error ? err.message : "建立失敗" });
    }
  });

  const succeeded = results.filter((r) => r.id !== undefined).length;
  return json({
    success: succeeded === dates.length,
    batchId,
    total: dates.length,
    succeeded,
    failed: dates.length - succeeded,
    results,
  });
}
