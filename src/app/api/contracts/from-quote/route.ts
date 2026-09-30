// 從報價單一鍵產生合約：品項、金額、客戶資料、專案名稱全部由伺服器從報價單讀出來帶入，
// 不用在前端重打一次，也不會跟報價單對不上。同一張報價單已經有「未作廢」的合約時不重複建立，
// 回 409 並附上既有合約的 id，讓前端直接帶使用者過去。
import {
  ragicGetOne,
  ragicList,
  createContractWithItems,
  unwrapSubtableRows,
  CONTRACT_FIELD,
  QUOTE_READ_FIELD,
  QUOTE_ITEM_SUBTABLE_READ_KEY,
  QUOTE_ITEM_READ_FIELD,
  SHEET,
  type ContractItemInput,
} from "@/server/lib/quotationRagic";
import { toContractSummary, getTodayRagicDate } from "@/server/modules/contracts";
import { calcQuoteTotals, DEFAULT_DISCOUNT_RATE, DEFAULT_TAX_MODE, DEFAULT_TAX_RATE } from "@/server/modules/quotes";
import { str } from "@/server/modules/dates";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function POST(req: Request) {
  const locked = lockedResponse("contracts");
  if (locked) return locked;

  const body = await readBody<{ quoteId?: unknown }>(req);
  const quoteId = typeof body.quoteId === "string" || typeof body.quoteId === "number" ? String(body.quoteId) : "";
  if (!/^\d+$/.test(quoteId)) {
    return json({ success: false, error: "quoteId 必須是報價單紀錄編號" }, 400);
  }

  try {
    const quote = await ragicGetOne(SHEET.quotes, quoteId);
    if (!quote || Object.keys(quote).length === 0) {
      return json({ success: false, error: "找不到這筆報價單" }, 404);
    }
    const quoteNumber = str(quote[QUOTE_READ_FIELD.報價單編號]);
    if (!quoteNumber) {
      return json({ success: false, error: "這張報價單還沒有報價單編號，無法產生合約" }, 400);
    }

    const contracts = await ragicList(SHEET.contracts, "subtables=0");
    const existing = Object.entries(contracts)
      .map(([id, record]) => toContractSummary(id, record))
      .find((c) => c.quoteNumber === quoteNumber && c.status !== "作廢");
    if (existing) {
      return json(
        { success: false, error: `這張報價單已經有合約 ${existing.contractNumber || `#${existing.id}`}`, id: existing.id },
        409,
      );
    }

    const items: ContractItemInput[] = unwrapSubtableRows(quote[QUOTE_ITEM_SUBTABLE_READ_KEY]).map((row) => ({
      name: str(row[QUOTE_ITEM_READ_FIELD.商品名稱]),
      price: str(row[QUOTE_ITEM_READ_FIELD.單價]),
      unit: str(row[QUOTE_ITEM_READ_FIELD.單位]),
      qty: str(row[QUOTE_ITEM_READ_FIELD.數量]) || "1",
    }));

    // 合約金額沿用報價單存的總金額（含稅）；萬一是空的就用報價單的品項＋折扣＋稅率重算一次
    let amount = str(quote[QUOTE_READ_FIELD.總金額含稅]);
    if (!amount) {
      amount = calcQuoteTotals(
        items.map((i) => ({ productId: "", price: i.price, qty: i.qty })),
        str(quote[QUOTE_READ_FIELD.折扣率]) || DEFAULT_DISCOUNT_RATE,
        str(quote[QUOTE_READ_FIELD.稅率]) || DEFAULT_TAX_RATE,
        str(quote[QUOTE_READ_FIELD.計稅方式]) || DEFAULT_TAX_MODE,
      ).totalAmount;
    }

    const ragicId = await createContractWithItems(
      {
        [CONTRACT_FIELD.報價單號]: quoteNumber,
        [CONTRACT_FIELD.客戶名稱]: str(quote[QUOTE_READ_FIELD.客戶名稱]),
        [CONTRACT_FIELD.統一編號]: str(quote[QUOTE_READ_FIELD.統一編號]),
        [CONTRACT_FIELD.聯絡人]: str(quote[QUOTE_READ_FIELD.聯絡人]),
        [CONTRACT_FIELD.聯絡人電話]: str(quote[QUOTE_READ_FIELD.聯絡人電話]),
        [CONTRACT_FIELD.聯絡地址]: str(quote[QUOTE_READ_FIELD.聯絡地址]),
        [CONTRACT_FIELD.Email]: str(quote[QUOTE_READ_FIELD.電子郵件]),
        [CONTRACT_FIELD.關聯專案]: str(quote[QUOTE_READ_FIELD.專案名稱]),
        [CONTRACT_FIELD.報價日期]: str(quote[QUOTE_READ_FIELD.報價日期]) || getTodayRagicDate(),
        [CONTRACT_FIELD.狀態]: "草稿",
        [CONTRACT_FIELD.合約金額]: amount,
      },
      items,
    );
    return json({ success: true, id: ragicId });
  } catch (err) {
    console.error("從報價單產生合約失敗:", err);
    return json({ success: false, error: errorMessage(err, "產生合約失敗") }, 500);
  }
}
