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
} as const;

export const F_TEMPLATE = {
  code: 1001399,
  name: 1001400,
  start: 1001401,
  end: 1001402,
  color: 1001403,
  order: 1001404,
  active: 1001405,
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
