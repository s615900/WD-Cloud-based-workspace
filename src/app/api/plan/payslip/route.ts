// 預排班的「薪資實領」：GET ?month=yyyy-MM 讀取；POST { month, name, amount } 設定（金額留空或 0＝取消）
import type { NextRequest } from "next/server";
import { listPayslips, setPayslip } from "@/server/ragic/payslip";
import { planNotConfiguredResponse } from "@/server/modules/plan";
import { errorMessage, json, readBody } from "@/server/http";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const month = req.nextUrl.searchParams.get("month");
  if (month !== null && !MONTH_RE.test(month)) return json({ error: "month 格式須為 yyyy-MM" }, 400);
  try {
    return json(await listPayslips(month ?? undefined));
  } catch (err) {
    console.error("取得薪資實領失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export async function POST(req: Request) {
  const blocked = planNotConfiguredResponse();
  if (blocked) return blocked;
  const body = await readBody<{ month?: unknown; name?: unknown; amount?: unknown }>(req);
  if (typeof body.month !== "string" || !MONTH_RE.test(body.month)) {
    return json({ success: false, error: "month 格式須為 yyyy-MM" }, 400);
  }
  if (typeof body.name !== "string" || !body.name.trim()) return json({ success: false, error: "name 不可為空" }, 400);
  const raw = typeof body.amount === "number" ? String(body.amount) : typeof body.amount === "string" ? body.amount.trim() : "";
  const amount = raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(amount) || amount < 0) return json({ success: false, error: "實領金額必須是 0 或正整數" }, 400);
  try {
    await setPayslip(body.month, body.name.trim(), amount);
    return json({ success: true });
  } catch (err) {
    console.error("設定薪資實領失敗:", err);
    return json({ success: false, error: errorMessage(err, "儲存失敗") }, 500);
  }
}
