// 報價單：對應 Ragic quotation-system/7（主表單Key 1000147，子表格Key 1000162）
import {
  ragicList,
  QUOTE_FIELD,
  QUOTE_READ_FIELD,
  QUOTE_ITEM_READ_FIELD,
  QUOTE_TAX_MODES,
  QUOTE_PAYMENT_STATUSES,
  SHEET,
  type QuoteItemInput,
  type RagicRecordData,
} from "../lib/quotationRagic";
import { str, toRagicDate } from "./dates";

const TAX_TYPES = ["營業稅"] as const;
// 數字型欄位，Ragic 只接受小數字串（"0.05"），帶 "5%" 會被判定成 "Invalid numeric value format."
const TAX_RATES = ["0.05"] as const;
export const DEFAULT_TAX_RATE = TAX_RATES[0];
export const DEFAULT_DISCOUNT_RATE = "1";
export const DEFAULT_TAX_MODE = "稅外加";
export const DEFAULT_PAYMENT_STATUS = "未付款";

// 未稅金額／稅額／總金額含稅透過 API 寫入品項後 Ragic 不會自動重算，要自己依
// 「品項小計 × 折扣率 × 稅率」算出來，邏輯要跟前端即時試算對齊。
// 稅外加（預設）＝品項小計就是未稅金額，稅額另外加上去；稅內含＝品項小計已經含稅，
// 要先除回未稅金額，總金額等於折扣後的小計本身。
export function calcQuoteTotals(items: QuoteItemInput[], discountRate: string, taxRate: string, taxMode: string) {
  const subtotal = items.reduce((sum, item) => {
    const price = parseFloat(item.price ?? "0") || 0;
    const qty = parseFloat(item.qty) || 0;
    return sum + price * qty;
  }, 0);
  const discount = parseFloat(discountRate);
  const afterDiscount = subtotal * (Number.isFinite(discount) ? discount : 1);
  const rate = parseFloat(taxRate);
  const safeRate = Number.isFinite(rate) ? rate : 0;

  let untaxed: number;
  let tax: number;
  let total: number;
  if (taxMode === "稅內含") {
    untaxed = afterDiscount / (1 + safeRate);
    total = afterDiscount;
    tax = total - untaxed;
  } else {
    untaxed = afterDiscount;
    tax = untaxed * safeRate;
    total = untaxed + tax;
  }
  return {
    untaxedAmount: String(untaxed),
    taxAmount: String(tax),
    totalAmount: String(total),
  };
}

// 專案名稱在 Ragic 設定為不可重複；同一天同一位客戶開兩張報價單就會撞名，這裡自動加
// -2、-3 後綴。excludeId 是編輯既有報價單時排除自己。
export async function ensureUniqueProjectName(base: string, excludeId?: string): Promise<string> {
  const data = await ragicList(SHEET.quotes, "subtables=0");
  const existing = new Set(
    Object.entries(data)
      .filter(([id]) => id !== excludeId)
      .map(([, record]) => str(record[QUOTE_READ_FIELD.專案名稱])),
  );
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function toQuoteSummary(id: string, record: RagicRecordData) {
  return {
    id: Number(id),
    quoteNumber: str(record[QUOTE_READ_FIELD.報價單編號]),
    projectCode: str(record[QUOTE_READ_FIELD.專案編號]),
    projectName: str(record[QUOTE_READ_FIELD.專案名稱]),
    clientId: str(record[QUOTE_READ_FIELD.客戶編號]),
    clientName: str(record[QUOTE_READ_FIELD.客戶名稱]),
    taxId: str(record[QUOTE_READ_FIELD.統一編號]),
    address: str(record[QUOTE_READ_FIELD.聯絡地址]),
    contact: str(record[QUOTE_READ_FIELD.聯絡人]),
    companyPhone: str(record[QUOTE_READ_FIELD.公司電話]),
    contactPhone: str(record[QUOTE_READ_FIELD.聯絡人電話]),
    email: str(record[QUOTE_READ_FIELD.電子郵件]),
    quoteDate: str(record[QUOTE_READ_FIELD.報價日期]),
    validUntil: str(record[QUOTE_READ_FIELD.報價有效期限]),
    taxType: str(record[QUOTE_READ_FIELD.課稅別]),
    taxMode: str(record[QUOTE_READ_FIELD.計稅方式]) || DEFAULT_TAX_MODE,
    discountRate: str(record[QUOTE_READ_FIELD.折扣率]),
    taxRate: str(record[QUOTE_READ_FIELD.稅率]),
    untaxedAmount: str(record[QUOTE_READ_FIELD.未稅金額]),
    taxAmount: str(record[QUOTE_READ_FIELD.稅額]),
    totalAmount: str(record[QUOTE_READ_FIELD.總金額含稅]),
    note: str(record[QUOTE_READ_FIELD.特別說明]),
    signStatus: str(record[QUOTE_READ_FIELD.簽核狀態中文]),
    paymentStatus: str(record[QUOTE_READ_FIELD.付款狀態]) || DEFAULT_PAYMENT_STATUS,
    paidAmount: str(record[QUOTE_READ_FIELD.已收金額]),
    contractTerms: str(record[QUOTE_READ_FIELD.合約條款內容]),
    readAt: str(record[QUOTE_READ_FIELD.已讀時間]),
    signerName: str(record[QUOTE_READ_FIELD.簽署人]),
    signedAt: str(record[QUOTE_READ_FIELD.簽署時間]),
  };
}

export function toQuoteItemView(row: RagicRecordData) {
  const ragicId = row["_ragicId"];
  return {
    id: typeof ragicId === "number" ? ragicId : null,
    productId: str(row[QUOTE_ITEM_READ_FIELD.產品編號]),
    name: str(row[QUOTE_ITEM_READ_FIELD.商品名稱]),
    price: str(row[QUOTE_ITEM_READ_FIELD.單價]),
    unit: str(row[QUOTE_ITEM_READ_FIELD.單位]),
    qty: str(row[QUOTE_ITEM_READ_FIELD.數量]),
    note: str(row[QUOTE_ITEM_READ_FIELD.備註]),
  };
}

interface QuoteItemBody {
  productId?: unknown;
  name?: unknown;
  price?: unknown;
  unit?: unknown;
  qty?: unknown;
  note?: unknown;
}

export interface QuoteBody {
  clientId?: unknown;
  clientName?: unknown;
  projectName?: unknown;
  taxId?: unknown;
  address?: unknown;
  contact?: unknown;
  companyPhone?: unknown;
  contactPhone?: unknown;
  email?: unknown;
  quoteDate?: unknown;
  validUntil?: unknown;
  taxType?: unknown;
  taxMode?: unknown;
  discountRate?: unknown;
  taxRate?: unknown;
  note?: unknown;
  contractTerms?: unknown;
  paymentStatus?: unknown;
  paidAmount?: unknown;
  items?: unknown;
}

// 驗證＋轉換品項陣列；回傳字串代表錯誤訊息，回傳陣列代表驗證通過
export function parseQuoteItems(raw: unknown): QuoteItemInput[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "items 必須是陣列";

  const items: QuoteItemInput[] = [];
  for (const [index, entry] of raw.entries()) {
    const item = entry as QuoteItemBody;
    if (typeof item.productId !== "string" || !item.productId.trim()) {
      return `第 ${index + 1} 項缺少產品編號`;
    }
    if (typeof item.qty !== "string" && typeof item.qty !== "number") {
      return `第 ${index + 1} 項的數量不可為空`;
    }
    items.push({
      productId: item.productId,
      qty: String(item.qty),
      name: typeof item.name === "string" ? item.name : undefined,
      price: item.price !== undefined ? String(item.price) : undefined,
      unit: typeof item.unit === "string" ? item.unit : undefined,
      note: typeof item.note === "string" ? item.note : undefined,
    });
  }
  return items;
}

export function validateQuoteEnums(body: QuoteBody): string | null {
  if (body.taxType !== undefined && body.taxType !== "" && !(TAX_TYPES as readonly string[]).includes(String(body.taxType))) {
    return `課稅別必須是 ${TAX_TYPES.join("/")}`;
  }
  if (body.taxRate !== undefined && body.taxRate !== "" && !(TAX_RATES as readonly string[]).includes(String(body.taxRate))) {
    return `稅率必須是 ${TAX_RATES.join("/")}`;
  }
  if (body.taxMode !== undefined && body.taxMode !== "" && !(QUOTE_TAX_MODES as readonly string[]).includes(String(body.taxMode))) {
    return `計稅方式必須是 ${QUOTE_TAX_MODES.join("/")}`;
  }
  if (
    body.paymentStatus !== undefined &&
    body.paymentStatus !== "" &&
    !(QUOTE_PAYMENT_STATUSES as readonly string[]).includes(String(body.paymentStatus))
  ) {
    return `付款狀態必須是 ${QUOTE_PAYMENT_STATUSES.join("/")}`;
  }
  return null;
}

// 主表單欄位：只有帶值的欄位才組進 Ragic 寫入內容，沒帶的欄位維持空白，交由 Ragic 端的
// 「連結載入」從客戶編號自動帶入。三個金額欄位由呼叫端依品項自己算完才加進去。
export function buildQuoteMainFields(body: QuoteBody): Record<string, string> {
  const map: [keyof QuoteBody, string][] = [
    ["clientId", QUOTE_FIELD.客戶編號],
    ["clientName", QUOTE_FIELD.客戶名稱],
    ["taxId", QUOTE_FIELD.統一編號],
    ["address", QUOTE_FIELD.聯絡地址],
    ["contact", QUOTE_FIELD.聯絡人],
    ["companyPhone", QUOTE_FIELD.公司電話],
    ["contactPhone", QUOTE_FIELD.聯絡人電話],
    ["email", QUOTE_FIELD.電子郵件],
    ["validUntil", QUOTE_FIELD.報價有效期限],
    ["taxType", QUOTE_FIELD.課稅別],
    ["taxMode", QUOTE_FIELD.計稅方式],
    ["discountRate", QUOTE_FIELD.折扣率],
    ["taxRate", QUOTE_FIELD.稅率],
    ["note", QUOTE_FIELD.特別說明],
    ["contractTerms", QUOTE_FIELD.合約條款內容],
    ["paymentStatus", QUOTE_FIELD.付款狀態],
    ["paidAmount", QUOTE_FIELD.已收金額],
  ];
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of map) {
    const val = body[key];
    if (val === undefined) continue;
    fields[fieldId] = String(val);
  }
  if (body.quoteDate !== undefined) {
    fields[QUOTE_FIELD.報價日期] = toRagicDate(String(body.quoteDate));
  }
  return fields;
}
