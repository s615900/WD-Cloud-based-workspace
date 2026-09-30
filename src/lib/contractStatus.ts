// 合約狀態規則（前後端共用）：狀態由雙方簽署情況自動決定，不再手動選。
// 只有「已結案」「作廢」兩個終止狀態是人工按鈕觸發。
//
// Ragic「狀態」欄位只接受 草稿／已發送／已簽約／已結案／作廢 這五個值，所以存進 Ragic 的
// 還是這五個；畫面上另外把「已發送」細分成「待客戶簽署／待負責人簽署」方便一眼看出卡在誰。

export interface ContractSignState {
  status: string;
  customerSignedAt: string;
  staffSignedAt: string;
}

export const TERMINAL_STATUSES = ["已結案", "作廢"] as const;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// 依簽署情況推算應該存進 Ragic 的狀態（終止狀態維持不動）。
// sent：是否已經產生過客戶簽署連結（草稿 → 已發送）。
export function derivedStoredStatus(c: ContractSignState, opts: { sent?: boolean } = {}): string {
  if (isTerminal(c.status)) return c.status;
  if (c.customerSignedAt && c.staffSignedAt) return "已簽約";
  if (c.customerSignedAt || c.staffSignedAt || opts.sent || c.status === "已發送") return "已發送";
  return "草稿";
}

// 從終止狀態「恢復」時，回到依簽署情況推算的狀態
export function restoredStatus(c: ContractSignState): string {
  return derivedStoredStatus({ ...c, status: "" });
}

export interface ContractStatusDisplay {
  label: string;
  badge: string; // globals.css 的徽章 class
}

export function displayContractStatus(c: ContractSignState): ContractStatusDisplay {
  if (c.status === "作廢") return { label: "作廢", badge: "badge-danger" };
  if (c.status === "已結案") return { label: "已結案", badge: "badge-muted" };
  if (c.customerSignedAt && c.staffSignedAt) return { label: "已簽約", badge: "badge-teal" };
  if (c.customerSignedAt) return { label: "待負責人簽署", badge: "badge-gold" };
  if (c.staffSignedAt || c.status === "已發送") return { label: "待客戶簽署", badge: "badge-gold" };
  return { label: "草稿", badge: "badge-muted" };
}

// 客戶簽名後合約內容（品項、金額、條款、客戶資料）鎖定，簽名才有保障。
// 要修改只能「作廢並建立新版本」：複製內容、清掉簽名，從草稿重新走一次簽署流程。
export function isContentLocked(c: { customerSignedAt: string }): boolean {
  return !!c.customerSignedAt;
}

export const CONTENT_LOCKED_MESSAGE = "客戶已簽署，合約內容已鎖定；如需修改請作廢並建立新版本";
