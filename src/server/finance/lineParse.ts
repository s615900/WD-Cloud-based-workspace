// LINE 財務指令解析（純函式，無外部依賴，方便單元測試）。

export type FinanceCommand =
  | { kind: "expense" | "income"; summary: string; amount: number; accountHint: string }
  | { kind: "month" }
  | { kind: "due" };

export function parseFinanceCommand(text: string): FinanceCommand | null {
  const t = text.trim();
  if (t === "本月") return { kind: "month" };
  if (t === "待繳") return { kind: "due" };
  const m = t.match(/^(記|收)\s+(.+?)\s+(\d+)(?:\s+(.+))?$/);
  if (!m) return null;
  const amount = Number(m[3]);
  return { kind: m[1] === "記" ? "expense" : "income", summary: m[2]!.trim(), amount, accountHint: (m[4] ?? "").trim() };
}
