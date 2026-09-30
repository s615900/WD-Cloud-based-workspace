// 新版行事曆功能：排班行程（/ragicforms21/8）查詢與新增。
import type { NextRequest } from "next/server";
import { listAllSchedule, createSchedule, type ScheduleKind, type ScheduleStatus } from "@/server/ragic/schedule";
import { filterAndSortSchedule, findTemplateByCode, getUserId } from "@/server/modules/roster";
import { DATE_RE, TIME_RE } from "@/server/modules/dates";
import { errorMessage, json, readBody } from "@/server/http";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const date = params.get("date");
  const from = params.get("from");
  const to = params.get("to");
  const batchId = params.get("batchId");

  if (date !== null && !DATE_RE.test(date)) return json({ error: "date 格式須為 yyyy-MM-dd" }, 400);
  if (from !== null && !DATE_RE.test(from)) return json({ error: "from 格式須為 yyyy-MM-dd" }, 400);
  if (to !== null && !DATE_RE.test(to)) return json({ error: "to 格式須為 yyyy-MM-dd" }, 400);

  try {
    const entries = await listAllSchedule();
    return json(
      filterAndSortSchedule(entries, {
        date: date ?? undefined,
        from: from ?? undefined,
        to: to ?? undefined,
        batchId: batchId || undefined,
      }),
    );
  } catch (err) {
    console.error("取得排班行程列表失敗:", err);
    return json({ error: "internal error" }, 500);
  }
}

interface ScheduleBody {
  date?: unknown;
  templateCode?: unknown;
  start?: unknown;
  end?: unknown;
  title?: unknown;
  allDay?: unknown;
  status?: unknown;
  color?: unknown;
  location?: unknown;
  note?: unknown;
}

export async function POST(req: Request) {
  const body = await readBody<ScheduleBody>(req);

  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return json({ success: false, error: "date 格式須為 yyyy-MM-dd" }, 400);
  }
  if (body.allDay !== undefined && typeof body.allDay !== "boolean") {
    return json({ success: false, error: "allDay 必須是布林值" }, 400);
  }
  const allDay = body.allDay === true;

  if (body.status !== undefined && body.status !== "正常" && body.status !== "取消") {
    return json({ success: false, error: "status 必須是 正常 或 取消" }, 400);
  }

  let kind: ScheduleKind;
  let title: string;
  let start: string;
  let end: string;
  let color: string;
  let templateCode: string;

  if (body.templateCode !== undefined) {
    if (typeof body.templateCode !== "string" || !body.templateCode.trim()) {
      return json({ success: false, error: "templateCode 不可為空" }, 400);
    }
    const template = await findTemplateByCode(body.templateCode.trim());
    if (!template) {
      return json({ success: false, error: "找不到對應的班別模板" }, 400);
    }
    kind = "班別";
    templateCode = template.code;
    title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : template.name;
    start = typeof body.start === "string" && body.start ? body.start : template.start;
    end = typeof body.end === "string" && body.end ? body.end : template.end;
    color = typeof body.color === "string" && body.color ? body.color : template.color;
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      return json({ success: false, error: "start / end 格式須為 HH:mm" }, 400);
    }
  } else {
    kind = "個人行程";
    templateCode = "";
    if (typeof body.title !== "string" || !body.title.trim()) {
      return json({ success: false, error: "title 不可為空" }, 400);
    }
    title = body.title.trim();
    start = allDay ? "00:00" : String(body.start ?? "");
    end = allDay ? "23:59" : String(body.end ?? "");
    if (!allDay && (!TIME_RE.test(start) || !TIME_RE.test(end))) {
      return json({ success: false, error: "start / end 格式須為 HH:mm" }, 400);
    }
    color = typeof body.color === "string" ? body.color : "";
  }

  const location = typeof body.location === "string" ? body.location.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  try {
    const id = await createSchedule({
      userId: getUserId(),
      kind,
      date: body.date,
      start,
      end,
      title,
      allDay,
      status: (body.status as ScheduleStatus | undefined) ?? "正常",
      templateCode,
      color,
      location,
      note,
    });
    return json({ success: true, id });
  } catch (err) {
    console.error("新增排班行程失敗:", err);
    return json({ success: false, error: errorMessage(err, "新增失敗") }, 500);
  }
}
