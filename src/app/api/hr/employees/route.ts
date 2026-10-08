import { hrCreate, hrList } from "@/server/lib/hrRagic";
import {
  buildEmployeeFields,
  notConfiguredResponse,
  toEmployeeItem,
  validateEmployee,
  type EmployeeBody,
} from "@/server/modules/hr";
import { errorMessage, json, readBody } from "@/server/http";

export async function GET() {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  try {
    const data = await hrList("employees");
    const items = Object.entries(data).map(([id, record]) => toEmployeeItem(id, record));
    return json(items);
  } catch (err) {
    console.error("取得員工列表失敗:", err);
    return json({ success: false, error: errorMessage(err, "讀取失敗") }, 500);
  }
}

export async function POST(req: Request) {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  const body = await readBody<EmployeeBody>(req);
  const error = validateEmployee(body, false);
  if (error) return json({ success: false, error }, 400);

  try {
    const id = await hrCreate("employees", buildEmployeeFields(body, false));
    return json({ success: true, id });
  } catch (err) {
    console.error("新增員工失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
