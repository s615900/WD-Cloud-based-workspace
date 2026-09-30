import { updateSchedule, deleteSchedule } from "@/server/ragic/schedule";
import { DATE_RE, TIME_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/roster/schedule/[id]">;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readBody<Record<string, unknown>>(req);
  const update: Parameters<typeof updateSchedule>[1] = {};

  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return json({ success: false, error: "date 格式須為 yyyy-MM-dd" }, 400);
    }
    update.date = body.date;
  }
  if (body.start !== undefined) {
    if (typeof body.start !== "string" || !TIME_RE.test(body.start)) {
      return json({ success: false, error: "start 格式須為 HH:mm" }, 400);
    }
    update.start = body.start;
  }
  if (body.end !== undefined) {
    if (typeof body.end !== "string" || !TIME_RE.test(body.end)) {
      return json({ success: false, error: "end 格式須為 HH:mm" }, 400);
    }
    update.end = body.end;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return json({ success: false, error: "title 不可為空" }, 400);
    }
    update.title = body.title.trim();
  }
  if (body.allDay !== undefined) {
    if (typeof body.allDay !== "boolean") return json({ success: false, error: "allDay 必須是布林值" }, 400);
    update.allDay = body.allDay;
  }
  if (body.status !== undefined) {
    if (body.status !== "正常" && body.status !== "取消") {
      return json({ success: false, error: "status 必須是 正常 或 取消" }, 400);
    }
    update.status = body.status;
  }
  if (body.kind !== undefined) {
    if (body.kind !== "班別" && body.kind !== "個人行程" && body.kind !== "客戶預約") {
      return json({ success: false, error: "kind 必須是 班別、個人行程 或 客戶預約" }, 400);
    }
    update.kind = body.kind;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string") return json({ success: false, error: "color 必須是字串" }, 400);
    update.color = body.color;
  }
  if (body.location !== undefined) {
    if (typeof body.location !== "string") return json({ success: false, error: "location 必須是字串" }, 400);
    update.location = body.location;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== "string") return json({ success: false, error: "note 必須是字串" }, 400);
    update.note = body.note;
  }

  if (Object.keys(update).length === 0) {
    return json({ success: false, error: "沒有可更新的欄位" }, 400);
  }

  try {
    await updateSchedule(id, update);
    return json({ success: true });
  } catch (err) {
    console.error("更新排班行程失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteSchedule(id);
    return json({ success: true });
  } catch (err) {
    console.error("刪除排班行程失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
