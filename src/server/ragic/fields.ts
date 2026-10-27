// 新版行事曆功能（班別模板／空檔設定／排班行程）用的 Ragic 欄位編號常數。
// 集中放這裡，不要讓欄位編號散落成字串——GET 回應用中文欄位名當 key，
// POST / PATCH 一律用這裡的數字編號，兩者不對稱，混用會造成「API 回成功但欄位空白」的
// 靜默失敗（見 docs/03 文件的地雷提醒）。
//
// 需要 Replit Secret：RAGIC_FOLDER_BASE（資料夾層 base，例如
// https://ap15.ragic.com/qsprint/ragicforms21）。SHEET 底下只留數字尾碼，
// 避免跟 base 本身已含的 /ragicforms21 重複。

export const SHEET = {
  todo: "/1",
  template: "/6",
  config: "/7",
  schedule: "/8",
  freeslot: "/9",
  // 預排班（排班算時數／薪資用的草稿，不進行事曆）。路徑待 WD 建表後確認，見 docs/10
  plan: "/14",
  // 薪資實領：每個「期別（yyyy-MM）＋班別」一筆實際領到的金額，用來跟預排班算出的薪資對帳
  payslip: "/15",
} as const;

export const F_TEMPLATE = {
  code: 1001399,
  name: 1001400,
  start: 1001401,
  end: 1001402,
  color: 1001403,
  order: 1001404,
  active: 1001405,
  // 預排班薪資用：時薪、不計薪休息分鐘（模板表 2026/10/13 新增的兩個數字欄位）。
  // 0 = 尚未設定：讀取時一律當 0、寫入時直接略過（見 templatePayConfigured）。
  rate: 1001496,
  breakMin: 1001497,
} as const;

export const F_CONFIG = {
  name: 1001407,
  dayStart: 1001408,
  dayEnd: 1001409,
  bufferBefore: 1001410,
  bufferAfter: 1001411,
  minSlot: 1001412,
  roundTo: 1001413,
  publishDays: 1001414,
  bookingUrl: 1001415,
} as const;

export const F_SCHEDULE = {
  code: 1001417,
  userId: 1001418,
  kind: 1001419,
  date: 1001420,
  start: 1001422,
  end: 1001423,
  title: 1001424,
  allDay: 1001425,
  status: 1001426,
  templateCode: 1001427,
  batchId: 1001428,
  color: 1001429,
  location: 1001430,
  note: 1001431,
} as const;

// 行程表的「Google事件ID」欄位編號（雙向同步用，見 docs/11）。Ragic 建好欄位後把編號填在這裡，
// 填之前行程只會單向寫進 Google，不會回頭同步。
export const SCHEDULE_GCAL_FIELD_ID: string = "1001629";

// 行程表的「倒數日」「每年重複」欄位編號（下拉選單，選項 是／否）：行程標成倒數日後，
// 首頁與待辦事項頁會顯示「還有 N 天」；每年重複只照國曆算。
export const SCHEDULE_COUNTDOWN_FIELD_ID = "1001640";
export const SCHEDULE_YEARLY_FIELD_ID = "1001641";

// 空檔預約（/ragicforms21/9）。1001432 是 Ragic 自動編號欄位，絕不可寫入。
export const F_FREESLOT = {
  id: 1001432,
  userId: 1001433,
  date: 1001434,
  start: 1001435,
  end: 1001436,
  bookingStatus: 1001437,
  bookedBy: 1001438,
  bookedAt: 1001439,
  batchId: 1001440,
  scheduleCode: 1001441,
  createdAt: 1001442,
  note: 1001443,
} as const;

export function getRagicFolderBase(): string {
  const val = process.env["RAGIC_FOLDER_BASE"];
  if (!val) throw new Error("RAGIC_FOLDER_BASE is not set");
  return val;
}

export function sheetUrl(sheet: keyof typeof SHEET): string {
  return `${getRagicFolderBase()}${SHEET[sheet]}`;
}

// 預排班表（/ragicforms21/14）。每一筆是「某天排了某個班」，開始／結束／休息／時薪都存當下的
// 快照（建立時從班別模板複製），之後改模板不會讓已排好的月份薪資跟著變。
// 「班別編號」（1001488）在 Ragic 是自動編號、唯讀，不可寫入；程式用「班別名稱」對應模板。
// 休息分鐘、時薪在 Ragic 是文字欄位，寫入送數字字串、讀回再轉數字。
export const F_PLAN = {
  date: 1001487,
  name: 1001489,
  start: 1001490,
  end: 1001491,
  breakMin: 1001492,
  rate: 1001493,
  note: 1001494,
} as const;

export const F_PAYSLIP = {
  period: 1001636,
  name: 1001637,
  amount: 1001638,
} as const;

export function planConfigured(): boolean {
  return Object.values(F_PLAN).every((id) => id > 0);
}

// 預排班表的「雙倍」欄位編號（下拉選單，選項 是／否）：標記的班薪資算兩倍。
// Ragic 建好欄位後把編號填在這裡，填之前讀回來一律是「否」、寫入時略過。
export const PLAN_DOUBLE_FIELD_ID: string = "1001635";

export function planDoubleConfigured(): boolean {
  return PLAN_DOUBLE_FIELD_ID !== "";
}

export function templatePayConfigured(): boolean {
  return F_TEMPLATE.rate > 0 && F_TEMPLATE.breakMin > 0;
}
