// 預排班：查詢某月（?month=yyyy-MM）與批次新增。資料存在獨立的 Ragic 表，不進行事曆。
import type { NextRequest } from "next/server";
import { createPlan, listPlan } from "@/server/ragic/plan";
import { planDoubleConfigured, templatePayConfigured } from "@/server/ragic/fields";
import { findTemplateByCode } from "@/server/modules/roster";
import { planNotConfiguredResponse, validNonNegative, validTime } from "@/server/modules/plan";
import { DATE_RE } from "@/server/modules/dates";
import { runWithConcurrency } from "@/server/ragic/schedule";
import { errorMessage, json, readBody } from "@/server/http";

const MAX_DATES = 62;

export async function GET(req: NextRequest) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const month = req.nextUrl.searchParams.get("month");
  if (month !== null && !/^\d{4}-\d{2}$/.test(month)) return json({ error: "month 格式須為 yyyy-MM" }, 400);
  try {
    const all = await listPlan();
    return json({
      entries: month ? all.filter((e) => e.date.startsWith(month)) : all,
      templatePay: templatePayConfigured(),
      doublePay: planDoubleConfigured(),
    });
  } catch (err) {
    console.error("取得預排班失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

interface PlanBody {
  templateCode?: unknown;
  dates?: unknown;
  // 沒有模板的自訂班（templateCode 省略時必填 name／start／end）
  name?: unknown;
  start?: unknown;
  end?: unknown;
  breakMin?: unknown;
  rate?: unknown;
  note?: unknown;
  double?: unknown;
}

export async function POST(req: Request) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const body = await readBody<PlanBody>(req);

  if (!Array.isArray(body.dates) || body.dates.length === 0) {
    return json({ success: false, error: "dates 不可為空陣列" }, 400);
  }
  if (body.dates.length > MAX_DATES) return json({ success: false, error: `單次最多排 ${MAX_DATES} 天` }, 400);
  if (!body.dates.every((d): d is string => typeof d === "string" && DATE_RE.test(d))) {
    return json({ success: false, error: "dates 內每個日期格式須為 yyyy-MM-dd" }, 400);
  }
  const dates = [...new Set(body.dates as string[])];

  // 班別資料快照：有 templateCode 就從模板複製，body 帶的 start/end/breakMin/rate 可覆蓋
  let base = { name: "", start: "", end: "", breakMin: 0, rate: 0 };
  if (body.templateCode !== undefined) {
    if (typeof body.templateCode !== "string" || !body.templateCode.trim()) {
      return json({ success: false, error: "templateCode 不可為空" }, 400);
    }
    const t = await findTemplateByCode(body.templateCode.trim());
    if (!t) return json({ success: false, error: "找不到對應的班別模板" }, 400);
    base = { name: t.name, start: t.start, end: t.end, breakMin: t.breakMin, rate: t.rate };
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : base.name;
  const start = body.start !== undefined ? body.start : base.start;
  const end = body.end !== undefined ? body.end : base.end;
  if (!name) return json({ success: false, error: "name 不可為空" }, 400);
  if (!validTime(start) || !validTime(end)) return json({ success: false, error: "start / end 格式須為 HH:mm" }, 400);
  const breakMin = body.breakMin !== undefined ? body.breakMin : base.breakMin;
  const rate = body.rate !== undefined ? body.rate : base.rate;
  if (!validNonNegative(breakMin)) return json({ success: false, error: "breakMin 必須是 0 以上的數字" }, 400);
  if (!validNonNegative(rate)) return json({ success: false, error: "rate 必須是 0 以上的數字" }, 400);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (body.double !== undefined && typeof body.double !== "boolean") return json({ success: false, error: "double 必須是布林值" }, 400);
  const double = body.double === true;

  try {
    const results: { date: string; id?: number; error?: string }[] = [];
    await runWithConcurrency(dates, 3, async (date) => {
      try {
        const id = await createPlan({ date, name, start, end, breakMin, rate, note, double });
        results.push({ date, id });
      } catch (err) {
        results.push({ date, error: errorMessage(err, "建立失敗") });
      }
    });
    const succeeded = results.filter((r) => r.id !== undefined).length;
    return json({ success: succeeded === dates.length, total: dates.length, succeeded, failed: dates.length - succeeded, results });
  } catch (err) {
    console.error("新增預排班失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
