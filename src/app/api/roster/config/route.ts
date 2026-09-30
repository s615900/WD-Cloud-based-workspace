// 新版行事曆功能：空檔設定（/ragicforms21/7）讀寫。這張表永遠只有一筆記錄，且實際
// record_id 可能是數字 0——判斷「存不存在」一律用 != null，不用 truthy 檢查。
import { ragicUpdate } from "@/server/ragic/client";
import { F_CONFIG } from "@/server/ragic/fields";
import { findConfigRecord, toRosterConfig } from "@/server/modules/roster";
import { TIME_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

export async function GET() {
  try {
    const found = await findConfigRecord();
    if (found == null) {
      return json({ error: "空檔設定尚未建立（預期應永遠有一筆）" }, 500);
    }
    return json(toRosterConfig(String(found.id), found.raw));
  } catch (err) {
    console.error("取得空檔設定失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

export async function PATCH(req: Request) {
  const body = await readBody<Record<string, unknown>>(req);
  const fields: Record<string, string> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return json({ success: false, error: "name 不可為空" }, 400);
    fields[String(F_CONFIG.name)] = body.name.trim();
  }
  if (body.dayStart !== undefined) {
    if (typeof body.dayStart !== "string" || !TIME_RE.test(body.dayStart)) {
      return json({ success: false, error: "dayStart 格式須為 HH:mm" }, 400);
    }
    fields[String(F_CONFIG.dayStart)] = body.dayStart;
  }
  if (body.dayEnd !== undefined) {
    if (typeof body.dayEnd !== "string" || !TIME_RE.test(body.dayEnd)) {
      return json({ success: false, error: "dayEnd 格式須為 HH:mm" }, 400);
    }
    fields[String(F_CONFIG.dayEnd)] = body.dayEnd;
  }
  const intFields = [
    ["bufferBefore", F_CONFIG.bufferBefore],
    ["bufferAfter", F_CONFIG.bufferAfter],
    ["minSlot", F_CONFIG.minSlot],
  ] as const;
  for (const [key, fieldId] of intFields) {
    if (body[key] === undefined) continue;
    if (!isNonNegInt(body[key])) return json({ success: false, error: `${key} 必須是不小於 0 的整數` }, 400);
    fields[String(fieldId)] = String(body[key]);
  }
  if (body.roundTo !== undefined) {
    if (!isNonNegInt(body.roundTo) || body.roundTo === 0) {
      return json({ success: false, error: "roundTo 必須是大於 0 的整數" }, 400);
    }
    fields[String(F_CONFIG.roundTo)] = String(body.roundTo);
  }
  if (body.publishDays !== undefined) {
    if (!isNonNegInt(body.publishDays)) {
      return json({ success: false, error: "publishDays 必須是不小於 0 的整數" }, 400);
    }
    fields[String(F_CONFIG.publishDays)] = String(body.publishDays);
  }
  if (body.bookingUrl !== undefined) {
    if (typeof body.bookingUrl !== "string") return json({ success: false, error: "bookingUrl 必須是字串" }, 400);
    fields[String(F_CONFIG.bookingUrl)] = body.bookingUrl.trim();
  }

  if (Object.keys(fields).length === 0) {
    return json({ success: false, error: "沒有可更新的欄位" }, 400);
  }

  try {
    const found = await findConfigRecord();
    if (found == null) {
      return json({ success: false, error: "空檔設定記錄不存在，無法更新（預期應永遠有一筆）" }, 500);
    }
    await ragicUpdate("config", found.id, fields);
    return json({ success: true });
  } catch (err) {
    console.error("更新空檔設定失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
