import { ragicList, createQuoteWithItems, QUOTE_FIELD, SHEET } from "@/server/lib/quotationRagic";
import {
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_PAYMENT_STATUS,
  DEFAULT_TAX_MODE,
  DEFAULT_TAX_RATE,
  buildQuoteMainFields,
  calcQuoteTotals,
  ensureUniqueProjectName,
  parseQuoteItems,
  toQuoteSummary,
  validateQuoteEnums,
  type QuoteBody,
} from "@/server/modules/quotes";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function GET() {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  try {
    const data = await ragicList(SHEET.quotes, "subtables=0");
    const items = Object.entries(data)
      .map(([id, record]) => toQuoteSummary(id, record))
      .sort((a, b) => b.id - a.id);
    return json(items);
  } catch (err) {
    console.error("取得報價單列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  const locked = lockedResponse("quotes");
  if (locked) return locked;

  const body = await readBody<QuoteBody>(req);

  if (typeof body.clientId !== "string" || !body.clientId.trim()) {
    return json({ success: false, error: "clientId 不可為空" }, 400);
  }
  if (typeof body.quoteDate !== "string" || !body.quoteDate.trim()) {
    return json({ success: false, error: "報價日期不可為空" }, 400);
  }
  if (typeof body.projectName !== "string" || !body.projectName.trim()) {
    return json({ success: false, error: "專案名稱不可為空" }, 400);
  }
  const enumError = validateQuoteEnums(body);
  if (enumError) return json({ success: false, error: enumError }, 400);
  const items = parseQuoteItems(body.items);
  if (typeof items === "string") return json({ success: false, error: items }, 400);

  try {
    const mainFields = buildQuoteMainFields(body);
    mainFields[QUOTE_FIELD.專案名稱] = await ensureUniqueProjectName(body.projectName.trim());
    if (mainFields[QUOTE_FIELD.付款狀態] === undefined) {
      mainFields[QUOTE_FIELD.付款狀態] = DEFAULT_PAYMENT_STATUS;
    }
    const discountRate =
      typeof body.discountRate === "string" && body.discountRate ? body.discountRate : DEFAULT_DISCOUNT_RATE;
    const taxRate = typeof body.taxRate === "string" && body.taxRate ? body.taxRate : DEFAULT_TAX_RATE;
    const taxMode = typeof body.taxMode === "string" && body.taxMode ? body.taxMode : DEFAULT_TAX_MODE;
    mainFields[QUOTE_FIELD.計稅方式] = taxMode;
    const totals = calcQuoteTotals(items, discountRate, taxRate, taxMode);
    mainFields[QUOTE_FIELD.未稅金額] = totals.untaxedAmount;
    mainFields[QUOTE_FIELD.稅額] = totals.taxAmount;
    mainFields[QUOTE_FIELD.總金額含稅] = totals.totalAmount;

    const ragicId = await createQuoteWithItems(mainFields, items);
    return json({ success: true, id: ragicId });
  } catch (err) {
    console.error("新增報價單失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
