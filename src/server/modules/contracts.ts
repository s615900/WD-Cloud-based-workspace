// 合約：對應 Ragic quotation-system/12（主表單Key 1000635，子表格「品項」Key 1000657）
import {
  CONTRACT_FIELD,
  CONTRACT_READ_FIELD,
  CONTRACT_ITEM_READ_FIELD,
  type ContractItemInput,
  type RagicRecordData,
} from "../lib/quotationRagic";
import { str, toRagicDate } from "./dates";

export function getTodayRagicDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replaceAll("-", "/");
}

// 負責人簽署人：我們這一方（攝影服務提供方）簽合約的人。
// 預設是公司信箱，可用環境變數 CONTRACT_STAFF_EMAIL 覆蓋。
// 注意：Ragic「負責人簽署人」（1001332）是「選擇使用者」欄位，只接受該 Ragic 帳號裡的使用者，
// 公司信箱不是 Ragic 使用者，寫入會被 Ragic 默默忽略；所以網站顯示時，簽過名但欄位是空的，
// 就用這裡的預設值補上（這個 app 只有單一負責人，不會認錯人）。
export const DEFAULT_STAFF_SIGNER_EMAIL = "weite.wu@qsprinttw.com";

export function getStaffSignerEmail(): string {
  return process.env["CONTRACT_STAFF_EMAIL"] || DEFAULT_STAFF_SIGNER_EMAIL;
}

export function toContractSummary(id: string, record: RagicRecordData) {
  return {
    id: Number(id),
    contractNumber: str(record[CONTRACT_READ_FIELD.合約編號]),
    quoteNumber: str(record[CONTRACT_READ_FIELD.報價單號]),
    clientName: str(record[CONTRACT_READ_FIELD.客戶名稱]),
    taxId: str(record[CONTRACT_READ_FIELD.統一編號]),
    contact: str(record[CONTRACT_READ_FIELD.聯絡人]),
    contactPhone: str(record[CONTRACT_READ_FIELD.聯絡人電話]),
    address: str(record[CONTRACT_READ_FIELD.聯絡地址]),
    email: str(record[CONTRACT_READ_FIELD.Email]),
    projectName: str(record[CONTRACT_READ_FIELD.關聯專案]),
    quoteDate: str(record[CONTRACT_READ_FIELD.報價日期]),
    validUntil: str(record[CONTRACT_READ_FIELD.有效期限]),
    status: str(record[CONTRACT_READ_FIELD.狀態]),
    amount: str(record[CONTRACT_READ_FIELD.合約金額]),
    nda: str(record[CONTRACT_READ_FIELD.保密條款內容NDA]),
    note: str(record[CONTRACT_READ_FIELD.備註]),
    customerSignerName: str(record[CONTRACT_READ_FIELD.客戶簽署人]),
    customerSignedAt: str(record[CONTRACT_READ_FIELD.客戶簽署時間]),
    staffSignerEmail:
      str(record[CONTRACT_READ_FIELD.負責人簽署人]) ||
      (str(record[CONTRACT_READ_FIELD.負責人簽署時間]) ? getStaffSignerEmail() : ""),
    staffSignedAt: str(record[CONTRACT_READ_FIELD.負責人簽署時間]),
    signStatus: str(record[CONTRACT_READ_FIELD.簽核狀態中文]),
  };
}

export function toContractItemView(row: RagicRecordData) {
  const ragicId = row["_ragicId"];
  return {
    id: typeof ragicId === "number" ? ragicId : null,
    name: str(row[CONTRACT_ITEM_READ_FIELD.商品名稱]),
    price: str(row[CONTRACT_ITEM_READ_FIELD.單價]),
    unit: str(row[CONTRACT_ITEM_READ_FIELD.單位]),
    qty: str(row[CONTRACT_ITEM_READ_FIELD.數量]),
  };
}

interface ContractItemBody {
  name?: unknown;
  price?: unknown;
  unit?: unknown;
  qty?: unknown;
}

export interface ContractBody {
  quoteId?: unknown;
  quoteNumber?: unknown;
  clientName?: unknown;
  taxId?: unknown;
  contact?: unknown;
  contactPhone?: unknown;
  address?: unknown;
  email?: unknown;
  projectName?: unknown;
  quoteDate?: unknown;
  validUntil?: unknown;
  status?: unknown;
  amount?: unknown;
  nda?: unknown;
  note?: unknown;
  items?: unknown;
}

// 客戶資訊幾個唯讀欄位是前端選定報價單後自己組出來的，這裡只要是字串就收，不強制必填。
export function buildContractCustomerFields(body: ContractBody): Record<string, string> {
  const fields: Record<string, string> = {};
  if (typeof body.taxId === "string") fields[CONTRACT_FIELD.統一編號] = body.taxId;
  if (typeof body.contact === "string") fields[CONTRACT_FIELD.聯絡人] = body.contact;
  if (typeof body.contactPhone === "string") fields[CONTRACT_FIELD.聯絡人電話] = body.contactPhone;
  if (typeof body.address === "string") fields[CONTRACT_FIELD.聯絡地址] = body.address;
  if (typeof body.email === "string") fields[CONTRACT_FIELD.Email] = body.email;
  if (typeof body.projectName === "string") fields[CONTRACT_FIELD.關聯專案] = body.projectName;
  return fields;
}

// 驗證＋轉換品項陣列；回傳字串代表錯誤訊息，回傳陣列代表驗證通過
export function parseContractItems(raw: unknown): ContractItemInput[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "items 必須是陣列";

  const items: ContractItemInput[] = [];
  for (const [index, entry] of raw.entries()) {
    const item = entry as ContractItemBody;
    if (typeof item.name !== "string" || !item.name.trim()) {
      return `第 ${index + 1} 項缺少項目名稱`;
    }
    items.push({
      name: item.name,
      qty: item.qty !== undefined ? String(item.qty) : "1",
      price: item.price !== undefined ? String(item.price) : undefined,
      unit: typeof item.unit === "string" ? item.unit : undefined,
    });
  }
  return items;
}

// 主表單欄位：只有帶值的欄位才組進 Ragic 寫入內容，沒帶的欄位直接不送這個 key。
export function buildContractMainFields(body: ContractBody): Record<string, string> {
  const map: [keyof ContractBody, string][] = [
    ["amount", CONTRACT_FIELD.合約金額],
    ["nda", CONTRACT_FIELD.保密條款內容NDA],
    ["note", CONTRACT_FIELD.備註],
  ];
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of map) {
    const val = body[key];
    if (val === undefined) continue;
    fields[fieldId] = String(val);
  }
  if (body.validUntil !== undefined) {
    fields[CONTRACT_FIELD.有效期限] = body.validUntil ? toRagicDate(String(body.validUntil)) : "";
  }
  return fields;
}

export function parseSignatureImage(value: unknown): { mimeType: string; buffer: Buffer; extension: string } | null {
  const signatureImage = typeof value === "string" ? value : "";
  const match = signatureImage.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!match) return null;
  const [, mimeType, base64Data] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64Data, "base64"),
    extension: mimeType === "image/png" ? "png" : "jpg",
  };
}
