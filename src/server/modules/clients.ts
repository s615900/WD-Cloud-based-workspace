// 客戶資料：對應 Ragic quotation-system/1（主表單Key 1000042）
import { CLIENT_FIELD, CLIENT_READ_FIELD } from "../lib/quotationRagic";
import { str } from "./dates";

const CLIENT_TYPES = ["B2B", "B2C", "學校", "協會", "品牌"] as const;
const CONTACT_METHODS = ["LINE", "E-mail"] as const;
const PAYMENT_TERMS = ["現金", "轉帳"] as const;
// 戶別：跟 CLIENT_TYPES（客戶類型）是完全不同的軸，Ragic 表單預設值是「一般戶」。
const ACCOUNT_TYPES = ["公司戶", "一般戶"] as const;
const TAX_ID_RE = /^[0-9]{8}$/;

export interface ClientItem {
  id: number;
  code: string;
  type: string;
  accountType: string;
  taxId: string;
  name: string;
  owner: string;
  contact: string;
  contactPhone: string;
  companyPhone: string;
  address: string;
  email: string;
  ext: string;
  im: string;
  bankAccount: string;
  contactMethod: string;
  paymentTerms: string;
  note: string;
}

export function toClientItem(id: string, data: Record<string, unknown>): ClientItem {
  return {
    id: Number(id),
    code: str(data[CLIENT_READ_FIELD.客戶編號]),
    type: str(data[CLIENT_READ_FIELD.類型]),
    accountType: str(data[CLIENT_READ_FIELD.戶別]),
    taxId: str(data[CLIENT_READ_FIELD.統一編號]),
    name: str(data[CLIENT_READ_FIELD.客戶名稱]),
    owner: str(data[CLIENT_READ_FIELD.負責人]),
    contact: str(data[CLIENT_READ_FIELD.聯絡人]),
    contactPhone: str(data[CLIENT_READ_FIELD.聯絡人電話]),
    companyPhone: str(data[CLIENT_READ_FIELD.公司電話]),
    address: str(data[CLIENT_READ_FIELD.聯絡地址]),
    email: str(data[CLIENT_READ_FIELD.Email]),
    ext: str(data[CLIENT_READ_FIELD.分機]),
    im: str(data[CLIENT_READ_FIELD.即時通訊軟體]),
    bankAccount: str(data[CLIENT_READ_FIELD.銀行帳號]),
    contactMethod: str(data[CLIENT_READ_FIELD.聯絡方式]),
    paymentTerms: str(data[CLIENT_READ_FIELD.付款條件]),
    note: str(data[CLIENT_READ_FIELD.備註]),
  };
}

export interface ClientBody {
  type?: unknown;
  accountType?: unknown;
  taxId?: unknown;
  name?: unknown;
  owner?: unknown;
  contact?: unknown;
  contactPhone?: unknown;
  companyPhone?: unknown;
  address?: unknown;
  email?: unknown;
  ext?: unknown;
  im?: unknown;
  bankAccount?: unknown;
  contactMethod?: unknown;
  paymentTerms?: unknown;
  note?: unknown;
}

// 只有「客戶類型」「客戶名稱」是硬性必填，其餘欄位放寬為選填。
export function validateCreate(body: ClientBody): string | null {
  if (typeof body.type !== "string" || !(CLIENT_TYPES as readonly string[]).includes(body.type)) {
    return `客戶類型必須是 ${CLIENT_TYPES.join("/")}`;
  }
  if (typeof body.name !== "string" || !body.name.trim()) return "客戶名稱不可為空";
  const optionalError = validateOptionalFields(body);
  if (optionalError) return optionalError;
  if (String(body.accountType ?? "") === "公司戶" && (typeof body.taxId !== "string" || !body.taxId.trim())) {
    return "公司戶請填寫統一編號";
  }
  return null;
}

export function validateClientType(body: ClientBody): string | null {
  if (body.type !== undefined && !(CLIENT_TYPES as readonly string[]).includes(String(body.type))) {
    return `客戶類型必須是 ${CLIENT_TYPES.join("/")}`;
  }
  return null;
}

// PATCH 編輯時每個欄位都可省略，只驗證「有帶值時格式要對」
export function validateOptionalFields(body: ClientBody): string | null {
  if (body.taxId !== undefined && body.taxId !== "" && !TAX_ID_RE.test(String(body.taxId))) {
    return "統一編號格式須為 8 碼數字";
  }
  if (
    body.contactMethod !== undefined &&
    body.contactMethod !== "" &&
    !(CONTACT_METHODS as readonly string[]).includes(String(body.contactMethod))
  ) {
    return `聯絡方式必須是 ${CONTACT_METHODS.join("/")}`;
  }
  if (
    body.paymentTerms !== undefined &&
    body.paymentTerms !== "" &&
    !(PAYMENT_TERMS as readonly string[]).includes(String(body.paymentTerms))
  ) {
    return `付款條件必須是 ${PAYMENT_TERMS.join("/")}`;
  }
  if (
    body.accountType !== undefined &&
    body.accountType !== "" &&
    !(ACCOUNT_TYPES as readonly string[]).includes(String(body.accountType))
  ) {
    return `戶別必須是 ${ACCOUNT_TYPES.join("/")}`;
  }
  return null;
}

export function buildClientFields(body: ClientBody, partial: boolean): Record<string, string> {
  const map: [keyof ClientBody, string][] = [
    ["type", CLIENT_FIELD.類型],
    ["accountType", CLIENT_FIELD.戶別],
    ["taxId", CLIENT_FIELD.統一編號],
    ["name", CLIENT_FIELD.客戶名稱],
    ["owner", CLIENT_FIELD.負責人],
    ["contact", CLIENT_FIELD.聯絡人],
    ["contactPhone", CLIENT_FIELD.聯絡人電話],
    ["companyPhone", CLIENT_FIELD.公司電話],
    ["address", CLIENT_FIELD.聯絡地址],
    ["email", CLIENT_FIELD.Email],
    ["ext", CLIENT_FIELD.分機],
    ["im", CLIENT_FIELD.即時通訊軟體],
    ["bankAccount", CLIENT_FIELD.銀行帳號],
    ["contactMethod", CLIENT_FIELD.聯絡方式],
    ["paymentTerms", CLIENT_FIELD.付款條件],
    ["note", CLIENT_FIELD.備註],
  ];
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of map) {
    const val = body[key];
    if (val === undefined) {
      if (partial) continue;
      fields[fieldId] = "";
    } else {
      fields[fieldId] = String(val);
    }
  }
  return fields;
}
