import {
  ragicList,
  createContractWithItems,
  CONTRACT_FIELD,
  CONTRACT_STATUSES,
  SHEET,
} from "@/server/lib/quotationRagic";
import {
  buildContractCustomerFields,
  buildContractMainFields,
  getTodayRagicDate,
  parseContractItems,
  toContractSummary,
  type ContractBody,
} from "@/server/modules/contracts";
import { toRagicDate } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function GET() {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  try {
    const data = await ragicList(SHEET.contracts, "subtables=0");
    const items = Object.entries(data)
      .map(([id, record]) => toContractSummary(id, record))
      .sort((a, b) => b.id - a.id);
    return json(items);
  } catch (err) {
    console.error("取得合約列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const body = await readBody<ContractBody>(req);

  if (typeof body.quoteId !== "string" || !/^\d+$/.test(body.quoteId)) {
    return json({ success: false, error: "quoteId 必須是報價單紀錄編號" }, 400);
  }
  if (typeof body.quoteNumber !== "string" || !body.quoteNumber.trim()) {
    return json({ success: false, error: "quoteNumber 不可為空（應帶入選定報價單的報價單編號）" }, 400);
  }
  if (typeof body.clientName !== "string" || !body.clientName.trim()) {
    return json({ success: false, error: "clientName 不可為空（應帶入選定報價單的客戶名稱）" }, 400);
  }
  const status = typeof body.status === "string" && body.status ? body.status : "草稿";
  if (!(CONTRACT_STATUSES as readonly string[]).includes(status)) {
    return json({ success: false, error: `狀態必須是 ${CONTRACT_STATUSES.join("/")}` }, 400);
  }
  const items = parseContractItems(body.items);
  if (typeof items === "string") return json({ success: false, error: items }, 400);
  const quoteDate =
    typeof body.quoteDate === "string" && body.quoteDate ? toRagicDate(body.quoteDate) : getTodayRagicDate();

  try {
    const mainFields = {
      [CONTRACT_FIELD.報價單號]: body.quoteNumber,
      [CONTRACT_FIELD.客戶名稱]: body.clientName,
      [CONTRACT_FIELD.報價日期]: quoteDate,
      [CONTRACT_FIELD.狀態]: status,
      ...buildContractCustomerFields(body),
      ...buildContractMainFields(body),
    };
    const ragicId = await createContractWithItems(mainFields, items);
    return json({ success: true, id: ragicId });
  } catch (err) {
    console.error("新增合約失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
