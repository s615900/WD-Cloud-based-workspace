// 新版行事曆功能：班別模板（/ragicforms21/6）讀取與新增。
import { ragicList, ragicCreate } from "@/server/ragic/client";
import { F_TEMPLATE, templatePayConfigured } from "@/server/ragic/fields";
import { toTemplateItem } from "@/server/modules/roster";
import { TIME_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

export async function GET() {
  try {
    const data = await ragicList("template");
    const items = Object.entries(data).map(([id, r]) => toTemplateItem(id, r));
    items.sort((a, b) => a.order - b.order);
    return json(items);
  } catch (err) {
    console.error("取得班別模板列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

interface TemplateBody {
  code?: unknown;
  name?: unknown;
  start?: unknown;
  end?: unknown;
  color?: unknown;
  order?: unknown;
  active?: unknown;
  rate?: unknown;
  breakMin?: unknown;
}

// 驗證新增用的必填欄位，回傳錯誤訊息（沒有錯誤回傳 null）
function validateCreateBody(body: TemplateBody): string | null {
  if (typeof body.code !== "string" || !body.code.trim()) return "code 不可為空";
  if (typeof body.name !== "string" || !body.name.trim()) return "name 不可為空";
  if (typeof body.start !== "string" || !TIME_RE.test(body.start)) return "start 格式須為 HH:mm";
  if (typeof body.end !== "string" || !TIME_RE.test(body.end)) return "end 格式須為 HH:mm";
  if (typeof body.color !== "string" || !body.color.trim()) return "color 不可為空";
  if (typeof body.order !== "number" || !Number.isFinite(body.order)) return "order 必須是數字";
  if (body.active !== undefined && typeof body.active !== "boolean") return "active 必須是布林值";
  if (body.rate !== undefined && (typeof body.rate !== "number" || !Number.isFinite(body.rate) || body.rate < 0)) {
    return "rate（時薪）必須是 0 以上的數字";
  }
  if (
    body.breakMin !== undefined &&
    (typeof body.breakMin !== "number" || !Number.isFinite(body.breakMin) || body.breakMin < 0)
  ) {
    return "breakMin（休息分鐘）必須是 0 以上的數字";
  }
  return null;
}

export async function POST(req: Request) {
  const body = await readBody<TemplateBody>(req);
  const error = validateCreateBody(body);
  if (error) {
    return json({ success: false, error }, 400);
  }

  const active = body.active === undefined ? true : (body.active as boolean);
  const fields: Record<string, string> = {
    [String(F_TEMPLATE.code)]: (body.code as string).trim(),
    [String(F_TEMPLATE.name)]: (body.name as string).trim(),
    [String(F_TEMPLATE.start)]: body.start as string,
    [String(F_TEMPLATE.end)]: body.end as string,
    [String(F_TEMPLATE.color)]: (body.color as string).trim(),
    [String(F_TEMPLATE.order)]: String(body.order),
    [String(F_TEMPLATE.active)]: active ? "是" : "否",
  };

  // 時薪／休息分鐘：模板表還沒加這兩個欄位時略過（不能寫編號 0 的欄位）
  if (templatePayConfigured()) {
    if (typeof body.rate === "number") fields[String(F_TEMPLATE.rate)] = String(body.rate);
    if (typeof body.breakMin === "number") fields[String(F_TEMPLATE.breakMin)] = String(body.breakMin);
  }

  try {
    const id = await ragicCreate("template", fields);
    return json({ success: true, id });
  } catch (err) {
    console.error("新增班別模板失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
