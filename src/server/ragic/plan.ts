// 預排班（/ragicforms21/12）讀寫層。跟排班行程（schedule.ts）是兩張不同的表：這裡只是排班算
// 工時／薪資用的草稿，不會出現在行事曆、LINE 提醒或空檔推算。
// 欄位編號放在 fields.ts 的 F_PLAN；GET 用中文欄位名、POST 用欄位編號（見 fields.ts 說明）。
import { ragicList, ragicCreate, ragicUpdate, ragicDelete, type RagicRecordData } from "./client";
import { F_PLAN, PLAN_DOUBLE_FIELD_ID, planDoubleConfigured } from "./fields";
import type { PlanEntry } from "@/lib/types";

// Ragic 日期欄位讀回來是 yyyy/MM/dd，統一轉回 yyyy-MM-dd
function normalizeDate(raw: unknown): string {
  const m = String(raw ?? "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return m ? `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}` : String(raw ?? "");
}

function toPlanEntry(id: string, r: RagicRecordData): PlanEntry {
  return {
    id: Number(id),
    date: normalizeDate(r["日期"]),
    name: String(r["班別名稱"] ?? ""),
    start: String(r["開始時間"] ?? ""),
    end: String(r["結束時間"] ?? ""),
    breakMin: Number(r["休息分鐘"] ?? 0) || 0,
    rate: Number(r["時薪"] ?? 0) || 0,
    note: String(r["備註"] ?? ""),
    double: r["雙倍"] === "是",
  };
}

export async function listPlan(opts?: { fresh?: boolean }): Promise<PlanEntry[]> {
  const data = await ragicList("plan", "subtables=0", opts);
  return Object.entries(data)
    .map(([id, r]) => toPlanEntry(id, r))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export type PlanInput = Omit<PlanEntry, "id">;

export async function createPlan(input: PlanInput): Promise<number> {
  return ragicCreate("plan", {
    [String(F_PLAN.date)]: input.date,
    [String(F_PLAN.name)]: input.name,
    [String(F_PLAN.start)]: input.start,
    [String(F_PLAN.end)]: input.end,
    [String(F_PLAN.breakMin)]: String(input.breakMin),
    [String(F_PLAN.rate)]: String(input.rate),
    [String(F_PLAN.note)]: input.note,
    ...(planDoubleConfigured() && input.double ? { [PLAN_DOUBLE_FIELD_ID]: "是" } : {}),
  });
}

const UPDATABLE = {
  date: F_PLAN.date,
  name: F_PLAN.name,
  start: F_PLAN.start,
  end: F_PLAN.end,
  breakMin: F_PLAN.breakMin,
  rate: F_PLAN.rate,
  note: F_PLAN.note,
} as const;

const patchDouble = (input: Partial<PlanInput>) => input.double;

export async function updatePlan(id: number | string, input: Partial<PlanInput>): Promise<void> {
  const fields: Record<string, string> = {};
  for (const [key, fieldId] of Object.entries(UPDATABLE) as [keyof typeof UPDATABLE, number][]) {
    const v = input[key];
    if (v !== undefined) fields[String(fieldId)] = String(v);
  }
  if (planDoubleConfigured() && patchDouble(input) !== undefined) fields[PLAN_DOUBLE_FIELD_ID] = input.double ? "是" : "否";
  if (Object.keys(fields).length === 0) return;
  await ragicUpdate("plan", id, fields);
}

export async function deletePlan(id: number | string): Promise<void> {
  await ragicDelete("plan", id);
}
