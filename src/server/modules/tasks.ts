// 查詢（GET /api/tasks）跟新增（POST /api/tasks）共用同一組合法類型——空檔已經搬到獨立表
// （/ragicforms21/9，見 ragic/freeSlot.ts），不再是待辦事項的一種，兩邊都不開放。
export const VALID_TASK_TYPES = ["行程", "備忘"] as const;
export type TaskType = (typeof VALID_TASK_TYPES)[number];

export function isValidTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && (VALID_TASK_TYPES as readonly string[]).includes(value);
}

export const VALID_TASK_STATUSES = ["準備中", "完成"] as const;
