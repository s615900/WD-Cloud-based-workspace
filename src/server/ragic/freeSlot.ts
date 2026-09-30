// 空檔預約（/ragicforms21/9）共用讀寫層：比照 schedule.ts 的分層方式，純 I/O，不碰業務邏輯
// （業務邏輯留在 bot/ragic.ts 的既有 9 個匯出函式裡，這裡只負責跟 Ragic 溝通）。
//
// 取代舊版借用待辦表（/ragicforms21/1，類型="空檔"、內容文字塞時段字串）的做法——新表
// 日期／開始時間／結束時間各自獨立欄位，不用再從字串解析時段。
//
// 1001432（空檔編號）是 Ragic 自動編號欄位，絕不可寫入，見 fields.ts 的 F_FREESLOT。
import { ragicList, ragicCreate, ragicUpdate, ragicDelete, type RagicRecordData } from "./client";
import { F_FREESLOT } from "./fields";

export interface FreeSlotEntry {
  id: number;
  userId: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  bookingStatus: string; // 可預約／待確認／已預約／已取消
  bookedBy: string;
  bookedAt: string; // yyyy/MM/dd HH:mm:ss，未預約時為空字串
  batchId: string; // 公布批次（genScheduleCode("PUB")，見 ragic/schedule.ts），手動新增空檔時為空字串
  scheduleCode: string; // 確認預約後對應寫入 /ragicforms21/8 的 ScheduleEntry.code
  createdAt: string; // yyyy/MM/dd HH:mm:ss，這筆記錄本身的建立時間（不是空檔發生的日期，那是上面的 date）
  note: string;
}

// 「日期」（1001434）跟 schedule.ts 的「日期」（1001420）同樣是 Ragic 原生日期型別欄位：
// 寫入送 "2026-09-01"，讀回會變成 "2026/09/01"，這裡統一轉回 "yyyy-MM-dd"，理由同 schedule.ts
// 的 normalizeRagicDate 註解（避免任何用字串相等比對日期的地方撈不到資料）。
function normalizeRagicDate(raw: unknown): string {
  const s = String(raw ?? "");
  const match = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return s;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toFreeSlotEntry(id: string, r: RagicRecordData): FreeSlotEntry {
  return {
    id: Number(id),
    userId: String(r["使用者ID"] ?? ""),
    date: normalizeRagicDate(r["日期"]),
    start: String(r["開始時間"] ?? ""),
    end: String(r["結束時間"] ?? ""),
    bookingStatus: String(r["預約狀態"] ?? ""),
    bookedBy: String(r["預約人姓名"] ?? ""),
    bookedAt: String(r["預約時間戳記"] ?? ""),
    batchId: String(r["公布批次"] ?? ""),
    scheduleCode: String(r["行程對應編號"] ?? ""),
    createdAt: String(r["建立時間"] ?? ""),
    note: String(r["備註"] ?? ""),
  };
}

// 整張表讀回來，呼叫端自行篩選——空檔表預期資料量不大（個人使用情境），不需要分頁查詢，
// 比照 schedule.ts 的 listAllSchedule。
export async function listAllFreeSlots(): Promise<FreeSlotEntry[]> {
  const data = await ragicList("freeslot");
  return Object.entries(data).map(([id, r]) => toFreeSlotEntry(id, r));
}

// Ragic 的日期時間格式：yyyy/MM/dd HH:mm:ss（24 小時制含秒，經 WD 核對 /ragicforms21/1
// 歷史紀錄確認為實際寫入格式，跟表單資訊頁顯示的 yyyy/MM/dd hh:mm a 不同）。
// 1001439（預約時間戳記）／1001442（建立時間）都要用這個格式，匯出給 bot/ragic.ts 的
// 業務邏輯層（bookFreeSlotInRagic 等）在需要「現在」時間戳記時共用同一套格式。
export function formatFreeSlotTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export interface CreateFreeSlotInput {
  userId: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  bookingStatus?: string; // 預設「可預約」
  batchId?: string; // 預設空字串（手動新增空檔不打批次碼）
}

function buildCreateFreeSlotFields(input: CreateFreeSlotInput): Record<string, string> {
  return {
    [String(F_FREESLOT.userId)]: input.userId,
    [String(F_FREESLOT.date)]: input.date,
    [String(F_FREESLOT.start)]: input.start,
    [String(F_FREESLOT.end)]: input.end,
    [String(F_FREESLOT.bookingStatus)]: input.bookingStatus ?? "可預約",
    [String(F_FREESLOT.batchId)]: input.batchId ?? "",
    [String(F_FREESLOT.createdAt)]: formatFreeSlotTimestamp(new Date()),
  };
}

export async function createFreeSlot(input: CreateFreeSlotInput): Promise<number> {
  return ragicCreate("freeslot", buildCreateFreeSlotFields(input));
}

const UPDATABLE_FIELDS = {
  bookingStatus: F_FREESLOT.bookingStatus,
  bookedBy: F_FREESLOT.bookedBy,
  bookedAt: F_FREESLOT.bookedAt,
  scheduleCode: F_FREESLOT.scheduleCode,
  note: F_FREESLOT.note,
} as const;

export interface UpdateFreeSlotInput {
  bookingStatus?: string;
  bookedBy?: string;
  bookedAt?: string;
  scheduleCode?: string;
  note?: string;
}

export async function updateFreeSlot(id: number | string, input: UpdateFreeSlotInput): Promise<void> {
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of Object.entries(UPDATABLE_FIELDS) as [keyof UpdateFreeSlotInput, number][]) {
    const value = input[key];
    if (value === undefined) continue;
    fields[String(fieldId)] = value;
  }
  if (Object.keys(fields).length === 0) return;
  await ragicUpdate("freeslot", id, fields);
}

export async function deleteFreeSlot(id: number | string): Promise<void> {
  await ragicDelete("freeslot", id);
}
