// 攝影專案管理：對應 Ragic quotation-system/13（主表單Key 1000599）
import { PROJECT_FIELD, PROJECT_READ_FIELD, type RagicRecordData } from "../lib/quotationRagic";
import { str } from "./dates";

export function toProjectItem(id: string, record: RagicRecordData) {
  return {
    id: Number(id),
    // PROJECT_FIELD.專案編號（1000592）實測是連結報價單的欄位，值＝來源報價單自己的「專案編號」；
    // PROJECT_FIELD.專案名稱（1000593）實測透過 API 無法寫入、永遠是空字串，這裡不讀。
    projectCode: str(record[PROJECT_READ_FIELD.專案編號]),
    clientId: str(record[PROJECT_READ_FIELD.客戶編號]),
    contact: str(record[PROJECT_READ_FIELD.聯絡人]),
    clientName: str(record[PROJECT_READ_FIELD.客戶名稱]),
    companyPhone: str(record[PROJECT_READ_FIELD.公司電話]),
    email: str(record[PROJECT_READ_FIELD.電子郵件]),
    shootDate: str(record[PROJECT_READ_FIELD.拍攝日期]),
    projectType: str(record[PROJECT_READ_FIELD.專案類型]),
    status: str(record[PROJECT_READ_FIELD.專案狀態]),
    deliveryLink: str(record[PROJECT_READ_FIELD.雲端交付連結]),
  };
}

export interface ProjectBody {
  quoteId?: unknown;
  projectCode?: unknown;
  clientId?: unknown;
  contact?: unknown;
  clientName?: unknown;
  companyPhone?: unknown;
  email?: unknown;
  shootDate?: unknown;
  projectType?: unknown;
  status?: unknown;
}

// 聯絡人／客戶名稱／公司電話／電子郵件是前端選定客戶後自己組出來的，只要是字串就收。
export function buildProjectCustomerFields(body: ProjectBody): Record<string, string> {
  const fields: Record<string, string> = {};
  if (typeof body.contact === "string") fields[PROJECT_FIELD.聯絡人] = body.contact;
  if (typeof body.clientName === "string") fields[PROJECT_FIELD.客戶名稱] = body.clientName;
  if (typeof body.companyPhone === "string") fields[PROJECT_FIELD.公司電話] = body.companyPhone;
  if (typeof body.email === "string") fields[PROJECT_FIELD.電子郵件] = body.email;
  return fields;
}
