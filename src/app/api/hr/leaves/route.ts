import { EMPLOYEE_READ_FIELD, hrCreate, hrGetOne, hrList } from "@/server/lib/hrRagic";
import { buildLeaveFields, notConfiguredResponse, toLeaveItem, validateLeave, type LeaveBody } from "@/server/modules/hr";
import { str } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

export async function GET() {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  try {
    const data = await hrList("leaves");
    const items = Object.entries(data)
      .map(([id, record]) => toLeaveItem(id, record))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    return json(items);
  } catch (err) {
    console.error("取得請假紀錄失敗:", err);
    return json({ success: false, error: errorMessage(err, "讀取失敗") }, 500);
  }
}

export async function POST(req: Request) {
  const blocked = notConfiguredResponse();
  if (blocked) return blocked;

  const body = await readBody<LeaveBody>(req);
  const error = validateLeave(body);
  if (error) return json({ success: false, error }, 400);

  try {
    // 確認員工存在，順便取姓名寫進「員工姓名」方便在 Ragic 後台查看
    const employee = await hrGetOne("employees", String(body.employeeId));
    if (!employee) return json({ success: false, error: "找不到這位員工" }, 400);
    const id = await hrCreate("leaves", buildLeaveFields(body, str(employee[EMPLOYEE_READ_FIELD.姓名])));
    return json({ success: true, id });
  } catch (err) {
    console.error("新增請假紀錄失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
