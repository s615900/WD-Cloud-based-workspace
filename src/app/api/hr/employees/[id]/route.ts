import { hrDelete, hrList, hrUpdate, LEAVE_FIELD } from "@/server/lib/hrRagic";
import { buildEmployeeFields, isRecordId, notConfiguredResponse, validateEmployee, type EmployeeBody } from "@/server/modules/hr";
import { errorMessage, json, readBody } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/hr/employees/[id]">) {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  if (!isRecordId(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  const body = await readBody<EmployeeBody>(req);
  const error = validateEmployee(body, true);
  if (error) return json({ success: false, error }, 400);

  try {
    await hrUpdate("employees", id, buildEmployeeFields(body, true));
    return json({ success: true });
  } catch (err) {
    console.error("更新員工失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}

// 刪除員工時一併刪除他的請假紀錄（先刪請假、最後刪員工，中途失敗時員工資料還在、可以重試）
export async function DELETE(_req: Request, ctx: RouteContext<"/api/hr/employees/[id]">) {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  const { id } = await ctx.params;
  if (!isRecordId(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  try {
    const leaves = await hrList("leaves", `limit=10000&subtables=0&where=${LEAVE_FIELD.員工紀錄編號},eq,${id}`);
    for (const leaveId of Object.keys(leaves)) {
      await hrDelete("leaves", leaveId);
    }
    await hrDelete("employees", id);
    return json({ success: true, deletedLeaves: Object.keys(leaves).length });
  } catch (err) {
    console.error("刪除員工失敗:", err);
    return json({ success: false, error: errorMessage(err, "刪除失敗") }, 500);
  }
}
