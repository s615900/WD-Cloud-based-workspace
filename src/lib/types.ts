// 前端使用的 API 回應型別（對應 src/app/api/** 的輸出）

export type BusinessModuleKey = "clients" | "quotes" | "contracts" | "projects";
export type BusinessLocks = Partial<Record<BusinessModuleKey, boolean>>;

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

export interface ProductItem {
  id: number;
  code: string;
  name: string;
  unit: string;
  price: string;
  category: string;
}

export interface QuoteSummary {
  id: number;
  quoteNumber: string;
  projectCode: string;
  projectName: string;
  clientId: string;
  clientName: string;
  taxId: string;
  address: string;
  contact: string;
  companyPhone: string;
  contactPhone: string;
  email: string;
  quoteDate: string;
  validUntil: string;
  taxType: string;
  taxMode: string;
  discountRate: string;
  taxRate: string;
  untaxedAmount: string;
  taxAmount: string;
  totalAmount: string;
  note: string;
  signStatus: string;
  paymentStatus: string;
  paidAmount: string;
  contractTerms: string;
  readAt: string;
  signerName: string;
  signedAt: string;
}

export interface QuoteItem {
  id?: number | null;
  productId: string;
  name: string;
  price: string;
  unit: string;
  qty: string;
  note: string;
}

export interface QuoteDetail extends QuoteSummary {
  items: QuoteItem[];
}

export interface ContractSummary {
  id: number;
  contractNumber: string;
  quoteNumber: string;
  clientName: string;
  taxId: string;
  contact: string;
  contactPhone: string;
  address: string;
  email: string;
  projectName: string;
  quoteDate: string;
  validUntil: string;
  status: string;
  amount: string;
  nda: string;
  note: string;
  customerSignerName: string;
  customerSignedAt: string;
  staffSignerEmail: string;
  staffSignedAt: string;
  signStatus: string;
}

export interface ContractItem {
  id?: number | null;
  name: string;
  price: string;
  unit: string;
  qty: string;
}

export interface ContractDetail extends ContractSummary {
  items: ContractItem[];
}

export interface ProjectItem {
  id: number;
  projectCode: string;
  clientId: string;
  contact: string;
  clientName: string;
  companyPhone: string;
  email: string;
  shootDate: string;
  projectType: string;
  status: string;
  deliveryLink: string;
}

export interface TaskListItem {
  id: number;
  type: string;
  content: string;
  date: string | null;
  time: string;
  status: string;
  createdAt: string;
  source?: "todo" | "schedule";
}

export interface ScheduleItem {
  id: number;
  date: string;
  time: string;
  title: string;
  status: string;
}

export interface RosterTemplate {
  id: number;
  code: string;
  name: string;
  start: string;
  end: string;
  color: string;
  order: number;
  active: boolean;
}

export interface RosterEntry {
  id: number;
  date: string;
  start: string;
  end: string;
  title: string;
  allDay: boolean;
  status: "正常" | "取消";
  kind: string;
  color: string;
  batchId: string;
}

export interface RosterConfig {
  id: number;
  name: string;
  dayStart: string;
  dayEnd: string;
  bufferBefore: number;
  bufferAfter: number;
  minSlot: number;
  roundTo: number;
  publishDays: number;
  bookingUrl: string;
}

export interface FreeSlot {
  start: string;
  end: string;
}

export const PAYMENT_STATUSES = ["未付款", "已付訂金", "部分付款", "已付款", "已取消"] as const;
export const CONTRACT_STATUSES = ["草稿", "已發送", "已簽約", "已結案", "作廢"] as const;
