import { ragicUpdate, PROJECT_FIELD, PROJECT_STATUSES, PROJECT_TYPES, SHEET } from "@/server/lib/quotationRagic";
import { buildProjectCustomerFields, type ProjectBody } from "@/server/modules/projects";
import { toRagicDate } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const locked = lockedResponse("projects");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  const body = await readBody<ProjectBody>(req);
  if (body.status !== undefined && !(PROJECT_STATUSES as readonly string[]).includes(String(body.status))) {
    return json({ success: false, error: `專案狀態必須是 ${PROJECT_STATUSES.join("/")}` }, 400);
  }
  if (
    body.projectType !== undefined &&
    body.projectType !== "" &&
    !(PROJECT_TYPES as readonly string[]).includes(String(body.projectType))
  ) {
    return json({ success: false, error: `專案類型必須是 ${PROJECT_TYPES.join("/")}` }, 400);
  }

  const fields: Record<string, string> = buildProjectCustomerFields(body);
  if (body.projectCode !== undefined) fields[PROJECT_FIELD.專案編號] = String(body.projectCode);
  if (body.clientId !== undefined) fields[PROJECT_FIELD.客戶編號] = String(body.clientId);
  if (body.shootDate !== undefined) fields[PROJECT_FIELD.拍攝日期] = toRagicDate(String(body.shootDate));
  if (body.projectType !== undefined) fields[PROJECT_FIELD.專案類型] = String(body.projectType);
  if (body.status !== undefined) fields[PROJECT_FIELD.專案狀態] = String(body.status);

  try {
    await ragicUpdate(SHEET.projects, id, fields);
    return json({ success: true });
  } catch (err) {
    console.error("更新專案失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
