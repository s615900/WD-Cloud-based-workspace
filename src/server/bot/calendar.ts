// Google Calendar API 串接（服務帳號驗證）
// 需要 Replit Secrets：GOOGLE_CLIENT_EMAIL、GOOGLE_PRIVATE_KEY、GOOGLE_CALENDAR_ID
// 重要：私鑰裡的換行字元在 Secrets 裡會變成 \n，程式裡要轉回真正的換行
//
// 雙向同步（見 docs/11）：行程（/ragicforms21/8 的「個人行程」）與 Google「待辦事項」日曆互相對應，
// 對應關係存在 Ragic 行程的「Google事件ID」欄位（見 ragic/schedule.ts）。這裡只負責 Google 端的讀寫。

import { google, type calendar_v3 } from "googleapis";

const TIME_ZONE = "Asia/Taipei";
// 台北沒有日光節約時間，固定 +08:00
const TAIPEI_OFFSET = "+08:00";

// Vercel 貼環境變數時常把頭尾的引號一起貼進去，這裡先去掉再還原換行，否則會出現 DECODER routines::unsupported
function privateKey(): string {
  const raw = (process.env["GOOGLE_PRIVATE_KEY"] ?? "").trim().replace(/^["']|["']$/g, "");
  return raw.replace(/\\n/g, "\n");
}

function makeAuth() {
  return new google.auth.JWT(
    process.env["GOOGLE_CLIENT_EMAIL"],
    undefined,
    privateKey(),
    ["https://www.googleapis.com/auth/calendar"],
  );
}

export function calendarConfigured(): boolean {
  return Boolean(
    process.env["GOOGLE_CLIENT_EMAIL"] && process.env["GOOGLE_PRIVATE_KEY"] && process.env["GOOGLE_CALENDAR_ID"],
  );
}

function calendarApi() {
  const calendarId = process.env["GOOGLE_CALENDAR_ID"];
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID is not set");
  return { calendar: google.calendar({ version: "v3", auth: makeAuth() }), calendarId };
}

// Google 回 404（沒這筆）或 410（已永久刪除）
function isGone(err: unknown): boolean {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const status = Number(e.code ?? e.status ?? e.response?.status);
  return status === 404 || status === 410;
}

// 工作台行程的內容（Google 事件對應的欄位）
export interface CalendarItem {
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  title: string;
  allDay: boolean;
  location: string;
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

function toEventBody(item: CalendarItem): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: item.title || "行程",
    location: item.location || undefined,
  };
  if (item.allDay) {
    body.start = { date: item.date };
    body.end = { date: nextDay(item.date) };
    return body;
  }
  const start = new Date(`${item.date}T${item.start}:00${TAIPEI_OFFSET}`);
  let end = new Date(`${item.date}T${item.end}:00${TAIPEI_OFFSET}`);
  // 結束時間不合理（空白或不晚於開始）就沿用預設 1 小時
  if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
  body.start = { dateTime: start.toISOString(), timeZone: TIME_ZONE };
  body.end = { dateTime: end.toISOString(), timeZone: TIME_ZONE };
  return body;
}

// ISO 時刻 → 台北的日期與時間
function toTaipei(iso: string): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

// Google 事件 → 工作台行程內容；解析不出日期時間回傳 null
export function eventToItem(ev: calendar_v3.Schema$Event): CalendarItem | null {
  const title = ev.summary?.trim() || "（無標題）";
  const location = ev.location?.trim() ?? "";
  if (ev.start?.date) {
    return { date: ev.start.date, start: "00:00", end: "23:59", title, allDay: true, location };
  }
  if (!ev.start?.dateTime || !ev.end?.dateTime) return null;
  const start = toTaipei(ev.start.dateTime);
  const end = toTaipei(ev.end.dateTime);
  // 跨日事件：工作台行程只有單一日期，結束時間截到當天 23:59
  return { date: start.date, start: start.time, end: end.date === start.date ? end.time : "23:59", title, allDay: false, location };
}

// 新增事件，回傳 Google 事件 ID
export async function createGoogleEvent(item: CalendarItem): Promise<string> {
  const { calendar, calendarId } = calendarApi();
  const res = await calendar.events.insert({ calendarId, requestBody: toEventBody(item) });
  if (!res.data.id) throw new Error("Google 日曆新增成功但回應缺少事件 ID");
  return res.data.id;
}

// 更新事件（同時把已刪除的事件還原）。事件已不存在回傳 false，由呼叫端決定要不要重建。
export async function updateGoogleEvent(eventId: string, item: CalendarItem): Promise<boolean> {
  const { calendar, calendarId } = calendarApi();
  try {
    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: { ...toEventBody(item), status: "confirmed" },
    });
    return true;
  } catch (err) {
    if (isGone(err)) return false;
    throw err;
  }
}

export async function deleteGoogleEvent(eventId: string): Promise<void> {
  const { calendar, calendarId } = calendarApi();
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    if (!isGone(err)) throw err;
  }
}

// 讀單一事件；不存在回傳 null。已刪除的事件會以 status = "cancelled" 回傳。
export async function getGoogleEvent(eventId: string): Promise<calendar_v3.Schema$Event | null> {
  const { calendar, calendarId } = calendarApi();
  try {
    const res = await calendar.events.get({ calendarId, eventId });
    return res.data;
  } catch (err) {
    if (isGone(err)) return null;
    throw err;
  }
}

// 列出時間範圍內的事件（循環事件展開成單次，已刪除的不含）
export async function listGoogleEvents(timeMin: string, timeMax: string): Promise<calendar_v3.Schema$Event[]> {
  const { calendar, calendarId } = calendarApi();
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}
