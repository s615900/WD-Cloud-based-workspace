// 個人財務模組的 Ragic 欄位對照常數。欄位名稱、欄位編號、sheet 路徑、選項文字一律以
// 「05 財務模組 Ragic 欄位盤點表」為準（2026/10/19 已用實際 GET／POST 回應核對過 F1、F2、F3、F5）。
//
// 讀寫不對稱（混用會 HTTP 200 但什麼都沒寫進去）：
//   GET 回應用「中文欄位名」當 key；POST / PATCH 一律用下面的「數字欄位編號」。
// 實測補充：
//   - 日期 GET 回 yyyy/MM/dd，POST 送 yyyy-MM-dd 可正常寫入。
//   - 數字欄位（金額、期初餘額、排序）GET 回來是字串，讀取後要自己轉數字。
//   - 第一筆紀錄的 record id 是 0（GET 的 key 為 "0"），0 是有效值，不可用 falsy 判斷。

// 表單在 QUOTATION_RAGIC_BASE_URL（帳號根網址）底下的路徑。
// 注意：sheet 編號 ≠ F 編號（F4 在 /8、F7 在 /9、F8 在 /7），禁止用 F 編號推算路徑。
export const FINANCE_SHEETS = {
  F1_ACCOUNT: "/personal-finance-module/2",
  F2_CATEGORY: "/personal-finance-module/4",
  F3_TRANSACTION: "/personal-finance-module/3",
  F4_RECURRING: "/personal-finance-module/8",
  F5_CARD: "/personal-finance-module/5",
  F6_STATEMENT: "/personal-finance-module/6",
  F7_INSTALLMENT: "/personal-finance-module/9",
  F8_LOAN: "/personal-finance-module/7",
  F8B_RATE_CHANGE: "/personal-finance-module/10",
  F9_INSURANCE: "/personal-finance-module/11",
  F10_SETTINGS: "/personal-finance-module/12",
} as const;

export type FinanceSheet = keyof typeof FINANCE_SHEETS;

// ── 寫入用：中文 key → 欄位編號 ──────────────────────────────────

export const F1 = {
  帳戶編號: 1001501,
  帳戶名稱: 1001502,
  帳戶類型: 1001503,
  機構: 1001504,
  末四碼: 1001505,
  期初餘額: 1001506,
  期初日期: 1001507,
  預設記帳: 1001508,
  啟用: 1001509,
  排序: 1001510,
  備註: 1001511,
} as const;

export const F2 = {
  分類名稱: 1001528,
  收支別: 1001529,
  顏色: 1001530,
  排序: 1001531,
  啟用: 1001532,
} as const;

export const F3 = {
  明細編號: 1001513,
  日期: 1001514,
  類型: 1001515,
  金額: 1001516,
  帳戶: 1001517,
  轉入帳戶: 1001518,
  分類: 1001519,
  摘要: 1001520,
  狀態: 1001521,
  來源: 1001522,
  來源鍵: 1001523,
  帳單月份: 1001524,
  建立時間: 1001525,
  備註: 1001526,
} as const;

// F5 只用來推算信用卡的帳單月份（結帳日）
export const F5 = {
  帳戶編號: 1001534,
  結帳日: 1001535,
  繳款截止日: 1001536,
  信用額度: 1001537,
  自動扣繳帳戶: 1001538,
  扣繳方式: 1001539,
  提醒天數: 1001540,
} as const;

// ── 選項值（須與 Ragic 下拉選單一字不差；程式內不要直接寫死中文字串比對）──

export const TX_TYPE = { 收入: "收入", 支出: "支出", 轉帳: "轉帳" } as const;
export const TX_STATUS = { 預定: "預定", 已入帳: "已入帳" } as const;
export const TX_SOURCE = {
  手動: "手動",
  定期: "定期",
  分期: "分期",
  貸款: "貸款",
  保險: "保險",
  卡費: "卡費",
} as const;
export const ACCOUNT_TYPE = {
  銀行: "銀行",
  現金: "現金",
  電子支付: "電子支付",
  信用卡: "信用卡",
} as const;
// F2 收支別（只有收入／支出，沒有轉帳）
export const CATEGORY_KIND = { 收入: "收入", 支出: "支出" } as const;

export type TxType = (typeof TX_TYPE)[keyof typeof TX_TYPE];
export type TxStatus = (typeof TX_STATUS)[keyof typeof TX_STATUS];
export type TxSource = (typeof TX_SOURCE)[keyof typeof TX_SOURCE];
export type AccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];
export type CategoryKind = (typeof CATEGORY_KIND)[keyof typeof CATEGORY_KIND];

// 「是／否」欄位：F1、F2 實測是下拉選單，GET 回「是」。同時接受勾選欄位的 "Yes"，
// 萬一日後 Ragic 欄位改型態也不會判斷失靈。
export const YES = "是";
export const NO = "否";

export function isYes(v: unknown): boolean {
  return v === YES || v === "Yes";
}

// ── F2 之後的積木用的欄位（一律照 05 盤點表抄寫，2026/10/19 已用 list_sheets 核對過）──

export const F4 = {
  規則編號: 1001569,
  名稱: 1001570,
  類型: 1001571,
  金額: 1001572,
  帳戶: 1001573,
  轉入帳戶: 1001574,
  分類: 1001575,
  頻率: 1001576,
  間隔N: 1001577,
  執行日: 1001578,
  開始日: 1001579,
  結束日: 1001580,
  自動入帳: 1001581,
  提醒天數: 1001582,
  啟用: 1001583,
} as const;

export const F6 = {
  帳單編號: 1001542,
  卡片: 1001543,
  帳單月份: 1001544,
  結帳日: 1001545,
  繳款截止日: 1001546,
  系統試算金額: 1001547,
  銀行帳單金額: 1001548,
  最低應繳: 1001549,
  已繳金額: 1001550,
  繳款日: 1001551,
  狀態: 1001552,
} as const;

export const F7 = {
  分期編號: 1001585,
  卡片: 1001586,
  品項: 1001587,
  分類: 1001588,
  消費日: 1001589,
  總金額: 1001590,
  期數: 1001591,
  首期帳單月份: 1001592,
  尾差處理: 1001593,
  手續費總額: 1001594,
  狀態: 1001595,
  提前清償日: 1001596,
  備註: 1001597,
} as const;

// 中文 key 含全形括號：期數（月）、寬限期（月），讀取時必須完全一致
export const F8 = {
  貸款編號: 1001554,
  名稱: 1001555,
  貸款機構: 1001556,
  貸款類型: 1001557,
  核貸金額: 1001558,
  撥款日: 1001559,
  年利率: 1001560,
  利率類型: 1001561,
  "期數（月）": 1001562,
  "寬限期（月）": 1001563,
  還款方式: 1001564,
  每月扣款日: 1001565,
  扣款帳戶: 1001566,
  狀態: 1001567,
} as const;

export const F8B = {
  貸款編號: 1001599,
  生效日: 1001600,
  新年利率: 1001601,
  備註: 1001602,
} as const;

export const F9 = {
  保單代號: 1001604,
  保險公司: 1001605,
  商品名稱: 1001606,
  險種: 1001607,
  要保人: 1001608,
  被保險人: 1001609,
  保障摘要: 1001610,
  生效日: 1001611,
  繳別: 1001612,
  每期保費: 1001613,
  繳費年期: 1001614,
  繳費終止日: 1001615,
  滿期日: 1001616,
  繳費方式: 1001617,
  扣款帳戶: 1001618,
  狀態: 1001619,
  理賠聯絡: 1001620,
  備註: 1001621,
} as const;

export const F10 = {
  設定名稱: 1001623,
  上次執行日: 1001624,
  提醒開關: 1001625,
  提醒時間: 1001626,
  預設提醒天數: 1001627,
} as const;

// ── 選項值 ──

export const RULE_FREQ = { 每月: "每月", 每週: "每週", 每年: "每年", 每N月: "每N月" } as const;
export const DEBIT_MODE = { 全額: "全額", 最低: "最低" } as const;
export const STMT_STATUS = { 待繳: "待繳", 部分繳: "部分繳", 已繳: "已繳", 逾期: "逾期" } as const;
export const REMAINDER_MODE = { 首期: "首期", 末期: "末期" } as const;
export const INST_STATUS = { 進行中: "進行中", 已結清: "已結清", 提前清償: "提前清償" } as const;
export const LOAN_TYPE = { 信貸: "信貸", 房貸: "房貸", 車貸: "車貸", 學貸: "學貸", 其他: "其他" } as const;
export const RATE_TYPE = { 固定: "固定", 機動: "機動" } as const;
export const REPAY_MODE = { 本息平均攤還: "本息平均攤還", 本金平均攤還: "本金平均攤還" } as const;
export const LOAN_STATUS = { 還款中: "還款中", 已結清: "已結清", 提前清償: "提前清償" } as const;
export const INS_KIND = {
  壽險: "壽險",
  醫療: "醫療",
  意外: "意外",
  重大傷病: "重大傷病",
  癌症: "癌症",
  車險: "車險",
  產險: "產險",
  儲蓄: "儲蓄",
  其他: "其他",
} as const;
export const INS_FREQ = { 年繳: "年繳", 半年繳: "半年繳", 季繳: "季繳", 月繳: "月繳", 躉繳: "躉繳" } as const;
export const INS_PAY_MODE = { 信用卡: "信用卡", 轉帳: "轉帳", 自行繳: "自行繳" } as const;
export const INS_STATUS = { 有效: "有效", 繳清: "繳清", 停效: "停效", 解約: "解約" } as const;

// 分類名稱：自動產生的明細用。預設分類（seed）有這幾個，沒有也照寫字串，不擋住排程
export const AUTO_CATEGORY = { 貸款還款: "貸款還款", 保險: "保險" } as const;
