import { deletePlan, updatePlan, type PlanInput } from "@/server/ragic/plan";
import { planNotConfiguredResponse, validNonNegative, validTime } from "@/server/modules/plan";
import { DATE_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/plan/[id]">;

export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const body = await readBody<Record<string, unknown>>(req);
  const patch: Partial<PlanInput> = {};

  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return json({ success: false, error: "date 格式須為 yyyy-MM-dd" }, 400);
    patch.date = body.date;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return json({ success: false, error: "name 不可為空" }, 400);
    patch.name = body.name.trim();
  }
  if (body.start !== undefined) {
    if (!validTime(body.start)) return json({ success: false, error: "start 格式須為 HH:mm" }, 400);
    patch.start = body.start;
  }
  if (body.end !== undefined) {
    if (!validTime(body.end)) return json({ success: false, error: "end 格式須為 HH:mm" }, 400);
    patch.end = body.end;
  }
  if (body.breakMin !== undefined) {
    if (!validNonNegative(body.breakMin)) return json({ success: false, error: "breakMin 必須是 0 以上的數字" }, 400);
    patch.breakMin = body.breakMin;
  }
  if (body.rate !== undefined) {
    if (!validNonNegative(body.rate)) return json({ success: false, error: "rate 必須是 0 以上的數字" }, 400);
    patch.rate = body.rate;
  }
  if (body.note !== undefined) patch.note = typeof body.note === "string" ? body.note.trim() : "";

  if (Object.keys(patch).length === 0) return json({ success: false, error: "沒有可更新的欄位" }, 400);
  try {
    await updatePlan(id, patch);
    return json({ success: true });
  } catch (err) {
    console.error("更新預排班失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  try {
    await deletePlan(id);
    return json({ success: true });
  } catch (err) {
    console.error("刪除預排班失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
