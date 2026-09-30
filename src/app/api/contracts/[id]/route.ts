import {
  ragicGetOne,
  ragicUpdate,
  replaceContractItems,
  unwrapSubtableRows,
  CONTRACT_FIELD,
  CONTRACT_READ_FIELD,
  CONTRACT_STATUSES,
  CONTRACT_ITEM_SUBTABLE_READ_KEY,
  SHEET,
} from "@/server/lib/quotationRagic";
import {
  buildContractCustomerFields,
  buildContractMainFields,
  parseContractItems,
  toContractItemView,
  toContractSummary,
  type ContractBody,
} from "@/server/modules/contracts";
import { str, toRagicDate } from "@/server/modules/dates";
import { CONTENT_LOCKED_MESSAGE, isContentLocked } from "@/lib/contractStatus";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/contracts/[id]">;

export async function GET(_req: Request, ctx: Ctx) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "id 格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.contracts, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ error: "找不到這筆合約" }, 404);
    }
    const rows = unwrapSubtableRows(record[CONTRACT_ITEM_SUBTABLE_READ_KEY]);
    return json({ ...toContractSummary(id, record), items: rows.map((row) => toContractItemView(row)) });
  } catch (err) {
    console.error("取得合約詳情失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  const body = await readBody<ContractBody>(req);
  if (body.status !== undefined && !(CONTRACT_STATUSES as readonly string[]).includes(String(body.status))) {
    return json({ success: false, error: `狀態必須是 ${CONTRACT_STATUSES.join("/")}` }, 400);
  }
  const items = parseContractItems(body.items);
  if (typeof items === "string") return json({ success: false, error: items }, 400);

  // 客戶簽名後合約內容鎖定：只允許改狀態（結案／作廢／恢復），要修改內容只能作廢後建立新版本
  const changesContent = Object.keys(body).some((key) => key !== "status");
  if (changesContent) {
    try {
      const current = await ragicGetOne(SHEET.contracts, id);
      if (isContentLocked({ customerSignedAt: str(current[CONTRACT_READ_FIELD.客戶簽署時間]) })) {
        return json({ success: false, error: CONTENT_LOCKED_MESSAGE }, 409);
      }
    } catch (err) {
      console.error("檢查合約鎖定狀態失敗:", err);
      return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
    }
  }

  const fields: Record<string, string> = { ...buildContractCustomerFields(body), ...buildContractMainFields(body) };
  if (body.quoteNumber !== undefined) fields[CONTRACT_FIELD.報價單號] = String(body.quoteNumber);
  if (body.clientName !== undefined) fields[CONTRACT_FIELD.客戶名稱] = String(body.clientName);
  if (body.quoteDate !== undefined) fields[CONTRACT_FIELD.報價日期] = toRagicDate(String(body.quoteDate));
  if (body.status !== undefined) fields[CONTRACT_FIELD.狀態] = String(body.status);

  try {
    if (Object.keys(fields).length > 0) {
      await ragicUpdate(SHEET.contracts, id, fields);
    }
    if (body.items !== undefined) {
      await replaceContractItems(id, items);
    }
    return json({ success: true });
  } catch (err) {
    console.error("更新合約失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
