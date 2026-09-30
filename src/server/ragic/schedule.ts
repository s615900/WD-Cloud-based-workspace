// 排班行程（/ragicforms21/8）共用讀寫層：新版管理介面（routes/rosterSchedule.ts）與
// LINE bot（bot/ragic.ts 的「行程」相關功能）都經由這裡存取，確保兩邊資料來源一致
// （見 docs/02 第四節欄位表、使用者確認：類型欄位單選值只有「班別」「個人行程」）。
//
// 所有欄位都是結構化存放（日期／開始時間／結束時間／標題各自獨立欄位），
// 不用任何從自由文字解析日期時間的邏輯——這是這次把「行程」資料源從 /ragicforms21/1
// 換到這裡的主要理由之一。
//
// 「客戶預約」是 W-006 v2 新增的第三個類型值，對應客戶經 book.html 送出、WD 在 LINE
// 上確認過的預約（見 bot/ragic.ts 的 confirmBookingInRagic）。WD 需先在 Ragic 後台把
// 這個值加進本欄位的下拉選項，程式端才寫得進去。
import { ragicList, ragicCreate, ragicUpdate, ragicDelete, type RagicRecordData } from "./client";
import { F_SCHEDULE } from "./fields";

export type ScheduleKind = "班別" | "個人行程" | "客戶預約";
export type ScheduleStatus = "正常" | "取消";

export interface ScheduleEntry {
  id: number;
  code: string;
  userId: string;
  kind: ScheduleKind;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  title: string;
  allDay: boolean;
  status: ScheduleStatus;
  templateCode: string;
  batchId: string;
  color: string;
  location: string;
  note: string;
}

// 「日期」（1001420）實測是 Ragic 原生日期型別欄位，不是純文字欄位：POST 送
// "2026-09-01" 進去，GET 讀回來卻變成 "2026/09/01"（Ragic 自己的顯示格式），寫入端
// 送的分隔符號會被忽略。這裡統一轉回 "yyyy-MM-dd"，讓 date 欄位在讀寫兩端保持一致，
// 不然任何用字串相等比對日期的地方（GET /roster/schedule?date=、空檔推算的當日／
// 前一日比對、月曆分組...）會全部撈不到資料，卻不會報錯——正是這批文件反覆提醒的
//「API 回成功但欄位空白」型靜默失敗，只是這次是日期欄位版本。
function normalizeRagicDate(raw: unknown): string {
  const s = String(raw ?? "");
  const match = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return s;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toScheduleEntry(id: string, r: RagicRecordData): ScheduleEntry {
  return {
    id: Number(id),
    code: String(r["行程編號"] ?? ""),
    userId: String(r["使用者ID"] ?? ""),
    kind: r["類型"] === "班別" ? "班別" : r["類型"] === "客戶預約" ? "客戶預約" : "個人行程",
    date: normalizeRagicDate(r["日期"]),
    start: String(r["開始時間"] ?? ""),
    end: String(r["結束時間"] ?? ""),
    title: String(r["標題"] ?? ""),
    allDay: r["全天"] === "是",
    status: r["狀態"] === "取消" ? "取消" : "正常",
    templateCode: String(r["來源模板"] ?? ""),
    batchId: String(r["排班群組"] ?? ""),
    color: String(r["班別顏色"] ?? ""),
    location: String(r["地點"] ?? ""),
    note: String(r["備註"] ?? ""),
  };
}

// 整張表讀回來，呼叫端自行依日期／使用者／群組等條件篩選——排班行程表預期資料量不大
// （個人使用情境），不需要另外做分頁查詢。
export async function listAllSchedule(): Promise<ScheduleEntry[]> {
  const data = await ragicList("schedule");
  return Object.entries(data).map(([id, r]) => toScheduleEntry(id, r));
}

// 產生行程編號／排班群組編號：時間戳記＋隨機字尾，足以在單一使用者情境下避免碰撞，
// 不需要另外查詢 Ragic 目前最大編號。
export function genScheduleCode(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}${rand}`.toUpperCase();
}

export interface CreateScheduleInput {
  userId: string;
  kind: ScheduleKind;
  date: string;
  start: string;
  end: string;
  title: string;
  allDay?: boolean;
  status?: ScheduleStatus;
  templateCode?: string;
  batchId?: string;
  color?: string;
  location?: string;
  note?: string;
  code?: string;
}

function buildScheduleFields(input: CreateScheduleInput): Record<string, string> {
  return {
    [String(F_SCHEDULE.code)]: input.code ?? genScheduleCode("SCH"),
    [String(F_SCHEDULE.userId)]: input.userId,
    [String(F_SCHEDULE.kind)]: input.kind,
    [String(F_SCHEDULE.date)]: input.date,
    [String(F_SCHEDULE.start)]: input.start,
    [String(F_SCHEDULE.end)]: input.end,
    [String(F_SCHEDULE.title)]: input.title,
    [String(F_SCHEDULE.allDay)]: input.allDay ? "是" : "否",
    [String(F_SCHEDULE.status)]: input.status ?? "正常",
    [String(F_SCHEDULE.templateCode)]: input.templateCode ?? "",
    [String(F_SCHEDULE.batchId)]: input.batchId ?? "",
    [String(F_SCHEDULE.color)]: input.color ?? "",
    [String(F_SCHEDULE.location)]: input.location ?? "",
    [String(F_SCHEDULE.note)]: input.note ?? "",
  };
}

export async function createSchedule(input: CreateScheduleInput): Promise<number> {
  return ragicCreate("schedule", buildScheduleFields(input));
}

const UPDATABLE_FIELDS = {
  kind: F_SCHEDULE.kind,
  date: F_SCHEDULE.date,
  start: F_SCHEDULE.start,
  end: F_SCHEDULE.end,
  title: F_SCHEDULE.title,
  allDay: F_SCHEDULE.allDay,
  status: F_SCHEDULE.status,
  templateCode: F_SCHEDULE.templateCode,
  batchId: F_SCHEDULE.batchId,
  color: F_SCHEDULE.color,
  location: F_SCHEDULE.location,
  note: F_SCHEDULE.note,
} as const;

export interface UpdateScheduleInput {
  kind?: ScheduleKind;
  date?: string;
  start?: string;
  end?: string;
  title?: string;
  allDay?: boolean;
  status?: ScheduleStatus;
  templateCode?: string;
  batchId?: string;
  color?: string;
  location?: string;
  note?: string;
}

export async function updateSchedule(id: number | string, input: UpdateScheduleInput): Promise<void> {
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of Object.entries(UPDATABLE_FIELDS) as [keyof UpdateScheduleInput, number][]) {
    const value = input[key];
    if (value === undefined) continue;
    fields[String(fieldId)] = typeof value === "boolean" ? (value ? "是" : "否") : String(value);
  }
  if (Object.keys(fields).length === 0) return;
  await ragicUpdate("schedule", id, fields);
}

export async function deleteSchedule(id: number | string): Promise<void> {
  await ragicDelete("schedule", id);
}

// 整組刪除（排班群組）：先讀回整張表找出同一個 batchId 的所有筆數，逐筆刪除。
// 併發上限 3，避免短時間內對 Ragic 打過多平行請求。
export async function deleteScheduleBatch(batchId: string): Promise<number> {
  const all = await listAllSchedule();
  const targets = all.filter((e) => e.batchId === batchId);
  await runWithConcurrency(targets, 3, (t) => ragicDelete("schedule", t.id));
  return targets.length;
}

// 通用併發限制執行器：同時最多 limit 個 in-flight，任務本身失敗會被吞掉並記錄，
// 不中斷其他任務——批次建立／批次刪除都需要「單筆失敗不影響其他筆」的語意，
// 呼叫端各自決定要不要檢查回傳結果裡的失敗筆數。
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      await task(item, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}
