import { ragicUpdate, ragicDelete } from "@/server/ragic/client";
import { F_TEMPLATE } from "@/server/ragic/fields";
import { TIME_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/roster/templates/[id]">;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readBody<Record<string, unknown>>(req);
  const fields: Record<string, string> = {};

  if (body.code !== undefined) {
    if (typeof body.code !== "string" || !body.code.trim()) return json({ success: false, error: "code 不可為空" }, 400);
    fields[String(F_TEMPLATE.code)] = body.code.trim();
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return json({ success: false, error: "name 不可為空" }, 400);
    fields[String(F_TEMPLATE.name)] = body.name.trim();
  }
  if (body.start !== undefined) {
    if (typeof body.start !== "string" || !TIME_RE.test(body.start)) {
      return json({ success: false, error: "start 格式須為 HH:mm" }, 400);
    }
    fields[String(F_TEMPLATE.start)] = body.start;
  }
  if (body.end !== undefined) {
    if (typeof body.end !== "string" || !TIME_RE.test(body.end)) {
      return json({ success: false, error: "end 格式須為 HH:mm" }, 400);
    }
    fields[String(F_TEMPLATE.end)] = body.end;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !body.color.trim()) return json({ success: false, error: "color 不可為空" }, 400);
    fields[String(F_TEMPLATE.color)] = body.color.trim();
  }
  if (body.order !== undefined) {
    if (typeof body.order !== "number" || !Number.isFinite(body.order)) {
      return json({ success: false, error: "order 必須是數字" }, 400);
    }
    fields[String(F_TEMPLATE.order)] = String(body.order);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return json({ success: false, error: "active 必須是布林值" }, 400);
    fields[String(F_TEMPLATE.active)] = body.active ? "是" : "否";
  }

  if (Object.keys(fields).length === 0) {
    return json({ success: false, error: "沒有可更新的欄位" }, 400);
  }

  try {
    await ragicUpdate("template", id, fields);
    return json({ success: true });
  } catch (err) {
    console.error("更新班別模板失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await ragicDelete("template", id);
    return json({ success: true });
  } catch (err) {
    console.error("刪除班別模板失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
