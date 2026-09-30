import { ragicList, ragicCreate, SHEET } from "@/server/lib/quotationRagic";
import { buildClientFields, toClientItem, validateCreate, type ClientBody } from "@/server/modules/clients";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function GET() {
  const locked = lockedResponse("clients");
  if (locked) return locked;

  try {
    const data = await ragicList(SHEET.clients, "subtables=0");
    const items = Object.entries(data)
      .map(([id, record]) => toClientItem(id, record))
      .sort((a, b) => b.id - a.id);
    return json(items);
  } catch (err) {
    console.error("取得客戶列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  const locked = lockedResponse("clients");
  if (locked) return locked;

  const body = await readBody<ClientBody>(req);
  const error = validateCreate(body);
  if (error) return json({ success: false, error }, 400);

  try {
    const ragicId = await ragicCreate(SHEET.clients, buildClientFields(body, false));
    return json({ success: true, id: ragicId });
  } catch (err) {
    console.error("新增客戶失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
