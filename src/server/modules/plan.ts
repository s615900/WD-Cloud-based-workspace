// 預排班 API 共用：尚未在 Ragic 建表時擋下、欄位驗證。
import { planConfigured } from "../ragic/fields";
import { TIME_RE } from "./dates";
import { json } from "../http";

export function planNotConfiguredResponse() {
  if (planConfigured()) return null;
  return json(
    { success: false, error: "預排班尚未設定 Ragic 表單（見 docs/10-預排班-Ragic建表.md）", notConfigured: true },
    503,
  );
}

export function validTime(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

export function validNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
