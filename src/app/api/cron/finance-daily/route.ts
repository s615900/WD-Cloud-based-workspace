// 財務每日引擎（給外部排程服務打，例如 cron-job.org，建議每天 08:30 Asia/Taipei）。
// 用 ?key= 帶 CRON_SECRET 驗證；?dryRun=1 只回傳將產生的內容，不寫入、不推播。
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runDaily } from "@/server/finance/daily";
import { json } from "@/server/http";

function isValidKey(provided: string | null): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handler(req: NextRequest) {
  if (!isValidKey(req.nextUrl.searchParams.get("key"))) return json({ error: "unauthorized" }, 401);
  try {
    return json(await runDaily({ dryRun: req.nextUrl.searchParams.get("dryRun") === "1" }));
  } catch (err) {
    console.error("財務每日引擎失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

export { handler as GET, handler as POST };
