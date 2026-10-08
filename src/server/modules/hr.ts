// 人事假勤：員工資料／請假紀錄的欄位轉換與驗證（對應 src/server/lib/hrRagic.ts）
import { EMPLOYEE_FIELD, EMPLOYEE_READ_FIELD, LEAVE_FIELD, LEAVE_READ_FIELD, hrConfigured } from "../lib/hrRagic";
import { LEAVE_TYPE_NAMES } from "@/lib/leave";
import type { EmployeeItem, LeaveItem } from "@/lib/types";
import { DATE_RE, str, toRagicDate } from "./dates";
import { json } from "../http";

export const EMPLOYEE_STATUSES = ["在職", "離職"] as const;

// Ragic 日期讀回來是 yyyy/MM/dd，統一轉成 yyyy-MM-dd
function ymd(v: unknown): string {
  return str(v).replaceAll("/", "-");
}

// 尚未在 hrRagic.ts 填好表單路徑與欄位編號時，API 直接擋下、不打 Ragic
export function notConfiguredResponse() {
  if (hrConfigured()) return null;
  return json({ success: false, error: "人事模組尚未設定 Ragic 表單（見 docs/08）", notConfigured: true }, 503);
}

export function isRecordId(id: string): boolean {
  return /^\d+$/.test(id);
}

// ── 員工 ────────────────────────────────────────────────────────

export function toEmployeeItem(id: string, data: Record<string, unknown>): EmployeeItem {
  const status = str(data[EMPLOYEE_READ_FIELD.在職狀態]);
  return {
    id: Number(id),
    name: str(data[EMPLOYEE_READ_FIELD.姓名]),
    hireDate: ymd(data[EMPLOYEE_READ_FIELD.到職日]),
    status: status === "離職" ? "離職" : "在職",
    leftDate: ymd(data[EMPLOYEE_READ_FIELD.離職日]),
    note: str(data[EMPLOYEE_READ_FIELD.備註]),
  };
}

export interface EmployeeBody {
  name?: unknown;
  hireDate?: unknown;
  status?: unknown;
  leftDate?: unknown;
  note?: unknown;
}

// partial = PATCH：每個欄位都可省略，有帶值時才驗證
export function validateEmployee(body: EmployeeBody, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return "姓名不可為空";
  }
  if (!partial || body.hireDate !== undefined) {
    if (typeof body.hireDate !== "string" || !DATE_RE.test(body.hireDate)) return "到職日格式須為 yyyy-MM-dd";
  }
  if (body.leftDate !== undefined && body.leftDate !== "" && !DATE_RE.test(String(body.leftDate))) {
    return "離職日格式須為 yyyy-MM-dd";
  }
  if (body.status !== undefined && !(EMPLOYEE_STATUSES as readonly string[]).includes(String(body.status))) {
    return `在職狀態必須是 ${EMPLOYEE_STATUSES.join("/")}`;
  }
  if (body.status === "離職" && (typeof body.leftDate !== "string" || !body.leftDate)) {
    return "離職請填寫離職日";
  }
  return null;
}

export function buildEmployeeFields(body: EmployeeBody, partial: boolean): Record<string, string> {
  const map: [keyof EmployeeBody, string, boolean?][] = [
    ["name", EMPLOYEE_FIELD.姓名],
    ["hireDate", EMPLOYEE_FIELD.到職日, true],
    ["status", EMPLOYEE_FIELD.在職狀態],
    ["leftDate", EMPLOYEE_FIELD.離職日, true],
    ["note", EMPLOYEE_FIELD.備註],
  ];
  const fields: Record<string, string> = {};
  for (const [key, fieldId, isDate] of map) {
    const val = body[key];
    if (val === undefined) {
      if (partial) continue;
      fields[fieldId] = key === "status" ? "在職" : "";
    } else {
      const s = String(val).trim();
      fields[fieldId] = isDate ? toRagicDate(s) : s;
    }
  }
  return fields;
}

// ── 請假 ────────────────────────────────────────────────────────

export function toLeaveItem(id: string, data: Record<string, unknown>): LeaveItem {
  return {
    id: Number(id),
    employeeId: Number(str(data[LEAVE_READ_FIELD.員工紀錄編號])) || 0,
    employeeName: str(data[LEAVE_READ_FIELD.員工姓名]),
    type: str(data[LEAVE_READ_FIELD.假別]),
    date: ymd(data[LEAVE_READ_FIELD.請假日期]),
    hours: Number(str(data[LEAVE_READ_FIELD.時數])) || 0,
    note: str(data[LEAVE_READ_FIELD.備註]),
  };
}

export interface LeaveBody {
  employeeId?: unknown;
  type?: unknown;
  date?: unknown;
  hours?: unknown;
  note?: unknown;
}

export function validateLeave(body: LeaveBody): string | null {
  if (!isRecordId(String(body.employeeId ?? ""))) return "請選擇員工";
  if (!LEAVE_TYPE_NAMES.includes(String(body.type))) return `假別必須是 ${LEAVE_TYPE_NAMES.join("/")}`;
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) return "請假日期格式須為 yyyy-MM-dd";
  const hours = Number(body.hours);
  // 以半小時為最小單位
  if (!Number.isFinite(hours) || hours <= 0 || hours > 8 * 60 || Math.round(hours * 2) !== hours * 2) {
    return "時數須為大於 0 的數字（最小單位 0.5 小時）";
  }
  return null;
}

export function buildLeaveFields(body: LeaveBody, employeeName: string): Record<string, string> {
  return Object.fromEntries([
    [LEAVE_FIELD.員工紀錄編號, String(body.employeeId)],
    [LEAVE_FIELD.員工姓名, employeeName],
    [LEAVE_FIELD.假別, String(body.type)],
    [LEAVE_FIELD.請假日期, toRagicDate(String(body.date))],
    [LEAVE_FIELD.時數, String(Number(body.hours))],
    [LEAVE_FIELD.備註, typeof body.note === "string" ? body.note.trim() : ""],
  ]);
}
