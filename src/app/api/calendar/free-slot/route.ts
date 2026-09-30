import { saveFreeSlotToRagic } from "@/server/bot/ragic";
import { DATE_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(req: Request) {
  const body = await readBody<{ date?: unknown; start?: unknown; end?: unknown }>(req);

  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return json({ success: false, error: "date 格式須為 yyyy-MM-dd" }, 400);
  }
  if (typeof body.start !== "string" || !TIME_RE.test(body.start)) {
    return json({ success: false, error: "start 格式須為 HH:mm" }, 400);
  }
  if (typeof body.end !== "string" || !TIME_RE.test(body.end)) {
    return json({ success: false, error: "end 格式須為 HH:mm" }, 400);
  }
  if (body.end <= body.start) {
    return json({ success: false, error: "結束時間須晚於開始時間" }, 400);
  }

  try {
    await saveFreeSlotToRagic(body.date, body.start, body.end);
    return json({ success: true });
  } catch (err) {
    console.error("新增空檔失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
