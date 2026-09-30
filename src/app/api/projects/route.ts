import {
  ragicList,
  ragicCreate,
  PROJECT_FIELD,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SHEET,
} from "@/server/lib/quotationRagic";
import { buildProjectCustomerFields, toProjectItem, type ProjectBody } from "@/server/modules/projects";
import { toRagicDate } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function GET() {
  const locked = lockedResponse("projects");
  if (locked) return locked;

  try {
    const data = await ragicList(SHEET.projects, "subtables=0");
    const items = Object.entries(data)
      .map(([id, record]) => toProjectItem(id, record))
      .sort((a, b) => b.id - a.id);
    return json(items);
  } catch (err) {
    console.error("取得專案列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  const locked = lockedResponse("projects");
  if (locked) return locked;

  const body = await readBody<ProjectBody>(req);

  if (typeof body.quoteId !== "string" || !/^\d+$/.test(body.quoteId)) {
    return json({ success: false, error: "quoteId 必須是報價單紀錄編號" }, 400);
  }
  if (typeof body.projectCode !== "string" || !body.projectCode.trim()) {
    return json({ success: false, error: "projectCode 不可為空（應帶入選定報價單自己的專案編號）" }, 400);
  }
  if (typeof body.clientId !== "string" || !body.clientId.trim()) {
    return json({ success: false, error: "clientId 不可為空" }, 400);
  }
  if (typeof body.shootDate !== "string" || !body.shootDate.trim()) {
    return json({ success: false, error: "拍攝日期不可為空" }, 400);
  }
  if (
    body.projectType !== undefined &&
    body.projectType !== "" &&
    !(PROJECT_TYPES as readonly string[]).includes(String(body.projectType))
  ) {
    return json({ success: false, error: `專案類型必須是 ${PROJECT_TYPES.join("/")}` }, 400);
  }
  const status = typeof body.status === "string" && body.status ? body.status : "洽談中";
  if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    return json({ success: false, error: `專案狀態必須是 ${PROJECT_STATUSES.join("/")}` }, 400);
  }

  try {
    const ragicId = await ragicCreate(SHEET.projects, {
      [PROJECT_FIELD.專案編號]: body.projectCode,
      [PROJECT_FIELD.客戶編號]: body.clientId,
      [PROJECT_FIELD.拍攝日期]: toRagicDate(body.shootDate),
      [PROJECT_FIELD.專案狀態]: status,
      ...(body.projectType ? { [PROJECT_FIELD.專案類型]: String(body.projectType) } : {}),
      ...buildProjectCustomerFields(body),
    });
    return json({ success: true, id: ragicId });
  } catch (err) {
    console.error("新增專案失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
