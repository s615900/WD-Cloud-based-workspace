import {
  ragicGetOne,
  ragicUpdate,
  replaceQuoteItems,
  unwrapSubtableRows,
  QUOTE_FIELD,
  QUOTE_READ_FIELD,
  QUOTE_ITEM_SUBTABLE_READ_KEY,
  SHEET,
} from "@/server/lib/quotationRagic";
import {
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_TAX_MODE,
  DEFAULT_TAX_RATE,
  buildQuoteMainFields,
  calcQuoteTotals,
  ensureUniqueProjectName,
  parseQuoteItems,
  toQuoteItemView,
  toQuoteSummary,
  validateQuoteEnums,
  type QuoteBody,
} from "@/server/modules/quotes";
import { str } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

type Ctx = RouteContext<"/api/quotes/[id]">;

export async function GET(_req: Request, ctx: Ctx) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "id 格式錯誤" }, 400);

  try {
    const record = await ragicGetOne(SHEET.quotes, id);
    if (!record || Object.keys(record).length === 0) {
      return json({ error: "找不到這筆報價單" }, 404);
    }
    const rows = unwrapSubtableRows(record[QUOTE_ITEM_SUBTABLE_READ_KEY]);
    return json({ ...toQuoteSummary(id, record), items: rows.map((row) => toQuoteItemView(row)) });
  } catch (err) {
    console.error("取得報價單詳情失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ success: false, error: "id 格式錯誤" }, 400);

  const body = await readBody<QuoteBody>(req);
  const enumError = validateQuoteEnums(body);
  if (enumError) return json({ success: false, error: enumError }, 400);
  const items = parseQuoteItems(body.items);
  if (typeof items === "string") return json({ success: false, error: items }, 400);

  try {
    const mainFields = buildQuoteMainFields(body);
    if (typeof body.projectName === "string" && body.projectName.trim()) {
      mainFields[QUOTE_FIELD.專案名稱] = await ensureUniqueProjectName(body.projectName.trim(), id);
    }
    if (body.items !== undefined) {
      // 品項有變動就要重算金額；折扣率／稅率／計稅方式這次沒帶的話，先讀出這筆報價單目前存的值，
      // 不能直接假設沒帶＝用預設值，否則會把使用者之前的設定悄悄蓋成系統預設。
      let discountRate = typeof body.discountRate === "string" && body.discountRate ? body.discountRate : undefined;
      let taxRate = typeof body.taxRate === "string" && body.taxRate ? body.taxRate : undefined;
      let taxMode = typeof body.taxMode === "string" && body.taxMode ? body.taxMode : undefined;
      if (discountRate === undefined || taxRate === undefined || taxMode === undefined) {
        const existing = await ragicGetOne(SHEET.quotes, id);
        if (discountRate === undefined) discountRate = str(existing[QUOTE_READ_FIELD.折扣率]) || DEFAULT_DISCOUNT_RATE;
        if (taxRate === undefined) taxRate = str(existing[QUOTE_READ_FIELD.稅率]) || DEFAULT_TAX_RATE;
        if (taxMode === undefined) taxMode = str(existing[QUOTE_READ_FIELD.計稅方式]) || DEFAULT_TAX_MODE;
      }
      mainFields[QUOTE_FIELD.計稅方式] = taxMode;
      const totals = calcQuoteTotals(items, discountRate, taxRate, taxMode);
      mainFields[QUOTE_FIELD.未稅金額] = totals.untaxedAmount;
      mainFields[QUOTE_FIELD.稅額] = totals.taxAmount;
      mainFields[QUOTE_FIELD.總金額含稅] = totals.totalAmount;
    }
    if (Object.keys(mainFields).length > 0) {
      await ragicUpdate(SHEET.quotes, id, mainFields);
    }
    if (body.items !== undefined) {
      await replaceQuoteItems(id, items);
    }
    return json({ success: true });
  } catch (err) {
    console.error("更新報價單失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
