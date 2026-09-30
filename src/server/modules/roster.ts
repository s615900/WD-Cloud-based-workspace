// 新版行事曆（班別模板／空檔設定／排班行程）路由共用的查詢邏輯。
// 每日提醒 cron、LINE webhook 跟 /api/roster/* 共用，確保各處看到的「當日行程／空檔」完全一致。
import { listAllSchedule, type ScheduleEntry } from "../ragic/schedule";
import { ragicList, type RagicRecordData } from "../ragic/client";
import {
  computeFreeSlots,
  type FreeSlotConfig,
  type ScheduleEntry as FreeSlotScheduleEntry,
  type FreeSlot,
} from "../ragic/freeSlots";
import { addDays } from "./dates";

export function getUserId(): string {
  const val = process.env["LINE_USER_ID"];
  if (!val) throw new Error("LINE_USER_ID is not set");
  return val;
}

// ── 班別模板 ──────────────────────────────────────────────

export interface TemplateItem {
  id: number;
  code: string;
  name: string;
  start: string;
  end: string;
  color: string;
  order: number;
  active: boolean;
}

export function toTemplateItem(recordId: string, r: Record<string, unknown>): TemplateItem {
  return {
    id: Number(recordId),
    code: String(r["模板編號"] ?? ""),
    name: String(r["模板名稱"] ?? ""),
    start: String(r["開始時間"] ?? ""),
    end: String(r["結束時間"] ?? ""),
    color: String(r["顏色"] ?? ""),
    order: Number(r["排序"] ?? 0),
    active: r["啟用"] === "是",
  };
}

export async function findTemplateByCode(code: string): Promise<TemplateItem | null> {
  const data = await ragicList("template");
  for (const [id, r] of Object.entries(data)) {
    const t = toTemplateItem(id, r);
    if (t.code === code) return t;
  }
  return null;
}

// ── 空檔設定（/ragicforms21/7，永遠只有一筆，record_id 可能是 0） ──────────

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

export function toRosterConfig(id: string, r: RagicRecordData): RosterConfig {
  return {
    id: Number(id),
    name: String(r["設定名稱"] ?? ""),
    dayStart: String(r["每日開始"] ?? ""),
    dayEnd: String(r["每日結束"] ?? ""),
    bufferBefore: Number(r["班前緩衝"] ?? 0),
    bufferAfter: Number(r["班後緩衝"] ?? 0),
    minSlot: Number(r["最短空檔"] ?? 0),
    roundTo: Number(r["時間對齊"] ?? 0),
    publishDays: Number(r["公布天數"] ?? 0),
    bookingUrl: String(r["預約連結"] ?? ""),
  };
}

// 讀回目前唯一一筆設定；不存在（理論上不應發生）回傳 null。
// 用 entries.length 判斷有沒有資料，不是用 recordId 本身的真假值（0 是合法值）。
export async function findConfigRecord(): Promise<{ id: number; raw: RagicRecordData } | null> {
  const data = await ragicList("config");
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  const [id, raw] = entries[0] as [string, RagicRecordData];
  const recordId = Number(id);
  if (!Number.isFinite(recordId)) return null;
  return { id: recordId, raw };
}

export async function loadRosterConfig(): Promise<RosterConfig | null> {
  const found = await findConfigRecord();
  return found ? toRosterConfig(String(found.id), found.raw) : null;
}

// ── 排班行程 ──────────────────────────────────────────────

export function toFreeSlotEntry(e: ScheduleEntry): FreeSlotScheduleEntry {
  return { start: e.start, end: e.end, allDay: e.allDay, status: e.status };
}

export function filterAndSortSchedule(
  entries: ScheduleEntry[],
  opts: { date?: string; from?: string; to?: string; batchId?: string },
): ScheduleEntry[] {
  const { date, from, to, batchId } = opts;
  let result = entries;
  if (date) result = result.filter((e) => e.date === date);
  if (from) result = result.filter((e) => e.date >= from);
  if (to) result = result.filter((e) => e.date <= to);
  if (batchId) result = result.filter((e) => e.batchId === batchId);
  return [...result].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export async function getScheduleForDate(date: string): Promise<ScheduleEntry[]> {
  const entries = await listAllSchedule();
  return filterAndSortSchedule(entries, { date });
}

// 單日空檔推算。回傳 null 代表空檔設定尚未建立。
export async function getFreeSlotsForDate(date: string): Promise<FreeSlot[] | null> {
  const config: FreeSlotConfig | null = await loadRosterConfig();
  if (!config) return null;

  const yesterday = addDays(date, -1);
  const all = await listAllSchedule();
  const today = all.filter((e) => e.date === date).map(toFreeSlotEntry);
  const prev = all.filter((e) => e.date === yesterday).map(toFreeSlotEntry);

  return computeFreeSlots(today, prev, config);
}
