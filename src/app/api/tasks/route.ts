// 待辦清單／新增事項表單用的 API，伺服器端代打 Ragic，API Key 不會出現在前端
import type { NextRequest } from "next/server";
import { queryTasksForApi, saveRecordToRagic } from "@/server/bot/ragic";
import { createSchedule } from "@/server/ragic/schedule";
import { addEventToCalendar } from "@/server/bot/calendar";
import { isValidTaskType } from "@/server/modules/tasks";
import { addDefaultDuration, DATE_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

const DATE_MMDD_RE = /^(\d{1,2})\/(\d{1,2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest) {
  const typeParam = req.nextUrl.searchParams.get("type");
  const keywordParam = req.nextUrl.searchParams.get("keyword");

  if (typeParam !== null && !isValidTaskType(typeParam)) {
    return json({ error: "type 必須是 行程 或 備忘" }, 400);
  }

  try {
    const tasks = await queryTasksForApi({
      type: typeParam ?? undefined,
      keyword: keywordParam ?? undefined,
    });
    return json(tasks);
  } catch (err) {
    console.error("查詢待辦失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

// 「行程」的 M/D 轉成 yyyy-MM-dd（年份用今年，Asia/Taipei，跟這個 App 其他地方
// 「同一年」的假設一致），寫進 /ragicforms21/8 需要的結構化日期欄位。
function mmddToIsoDate(mmdd: string): string | null {
  const match = mmdd.match(DATE_MMDD_RE);
  if (!match) return null;
  const [, month, day] = match;
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric" }).format(new Date());
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const body = await readBody<{ type?: unknown; content?: unknown; date?: unknown; time?: unknown; dueDate?: unknown }>(req);

  if (!isValidTaskType(body.type)) {
    return json({ success: false, error: "type 必須是 行程 或 備忘" }, 400);
  }

  const userId = process.env["LINE_USER_ID"];
  if (!userId) {
    return json({ success: false, error: "LINE_USER_ID is not set" }, 500);
  }

  if (typeof body.content !== "string" || !body.content.trim()) {
    return json({ success: false, error: "content 不可為空" }, 400);
  }
  const title = body.content.trim();

  if (body.type === "行程") {
    if (typeof body.date !== "string" || typeof body.time !== "string") {
      return json({ success: false, error: "行程需要 date（MM/DD）與 time（HH:mm）" }, 400);
    }
    const date = mmddToIsoDate(body.date);
    if (!date || !TIME_RE.test(body.time)) {
      return json({ success: false, error: "date 格式須為 MM/DD，time 格式須為 HH:mm" }, 400);
    }

    try {
      await createSchedule({
        userId,
        kind: "個人行程",
        date,
        start: body.time,
        end: addDefaultDuration(body.time),
        title,
        status: "正常",
      });
      try {
        await addEventToCalendar(`${body.date} ${body.time} ${title}`);
      } catch (calErr) {
        console.error("建立Google日曆事件失敗:", calErr);
      }
      return json({ success: true });
    } catch (err) {
      console.error("新增行程存檔失敗:", err);
      return json({ success: false, error: errorMessage(err, "存檔失敗") }, 500);
    }
  }

  try {
    if (body.dueDate !== undefined && (typeof body.dueDate !== "string" || (body.dueDate !== "" && !DATE_RE.test(body.dueDate)))) {
      return json({ success: false, error: "dueDate 格式須為 yyyy-MM-dd" }, 400);
    }
    await saveRecordToRagic(userId, { type: body.type, content: title, dueDate: body.dueDate || undefined });
    return json({ success: true });
  } catch (err) {
    console.error("新增事項存檔失敗:", err);
    return json({ success: false, error: errorMessage(err, "存檔失敗") }, 500);
  }
}
