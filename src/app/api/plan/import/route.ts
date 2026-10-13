// 預排班 → 行事曆：把某月的預排班匯入行事曆（排班行程表，kind=班別）。
// 已經在行事曆上的班（同日期＋班別名稱＋開始＋結束）會略過，所以可以重複按、不會重複匯入。
import { createSchedule, listAllSchedule, runWithConcurrency } from "@/server/ragic/schedule";
import { listPlan } from "@/server/ragic/plan";
import { ragicList } from "@/server/ragic/client";
import { getUserId, toTemplateItem } from "@/server/modules/roster";
import { planNotConfiguredResponse } from "@/server/modules/plan";
import { errorMessage, json, readBody } from "@/server/http";

export async function POST(req: Request) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const body = await readBody<{ month?: unknown }>(req);
  if (typeof body.month !== "string" || !/^\d{4}-\d{2}$/.test(body.month)) {
    return json({ success: false, error: "month 格式須為 yyyy-MM" }, 400);
  }
  const month = body.month;

  try {
    const [plan, schedule, templateData] = await Promise.all([listPlan(), listAllSchedule(), ragicList("template")]);
    const templates = Object.entries(templateData).map(([id, r]) => toTemplateItem(id, r));
    const key = (date: string, title: string, start: string, end: string) => `${date}|${title}|${start}|${end}`;
    const existing = new Set(schedule.filter((s) => s.kind === "班別").map((s) => key(s.date, s.title, s.start, s.end)));

    const inMonth = plan.filter((p) => p.date.startsWith(month));
    const todo = inMonth.filter((p) => !existing.has(key(p.date, p.name, p.start, p.end)));

    let succeeded = 0;
    await runWithConcurrency(todo, 3, async (p) => {
      const t = templates.find((x) => x.name === p.name);
      try {
        await createSchedule({
          userId: getUserId(),
          kind: "班別",
          date: p.date,
          start: p.start,
          end: p.end,
          title: p.name,
          templateCode: t?.code ?? "",
          color: t?.color ?? "",
          note: p.note,
        });
        succeeded++;
      } catch (err) {
        console.error("匯入預排班到行事曆失敗:", p.date, p.name, err);
      }
    });
    return json({
      success: succeeded === todo.length,
      imported: succeeded,
      failed: todo.length - succeeded,
      skipped: inMonth.length - todo.length,
    });
  } catch (err) {
    console.error("匯入預排班失敗:", err);
    return json({ success: false, error: errorMessage(err, "匯入失敗") }, 500);
  }
}
