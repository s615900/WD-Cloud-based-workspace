// Google Calendar API 串接（服務帳號驗證）
// 需要 Replit Secrets：GOOGLE_CLIENT_EMAIL、GOOGLE_PRIVATE_KEY、GOOGLE_CALENDAR_ID
// 重要：私鑰裡的換行字元在 Secrets 裡會變成 \n，程式裡要轉回真正的換行

import { google } from "googleapis";

function makeAuth() {
  return new google.auth.JWT(
    process.env["GOOGLE_CLIENT_EMAIL"],
    undefined,
    (process.env["GOOGLE_PRIVATE_KEY"] ?? "").replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/calendar"],
  );
}

// 解析「07/30 14:00 牙醫回診」，拆出日期時間跟標題
function parseScheduleText(content: string): {
  start: Date;
  end: Date;
  title: string;
} | null {
  const match = content.match(
    /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(.*)$/,
  );
  if (!match) return null;

  const [, month, day, hour, minute, title] = match;
  const year = new Date().getFullYear();

  // 「14:00」是台北時間，伺服器跑在 UTC，所以要扣掉台北的 +8 時區偏移，
  // 才能算出正確的 UTC 時刻（台北沒有日光節約時間，固定 +8 沒問題）。
  const start = new Date(
    Date.UTC(year, Number(month) - 1, Number(day), Number(hour) - 8, Number(minute)),
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 預設 1 小時

  return { start, end, title: title || "行程" };
}

// 在 Google 日曆新增一筆活動；格式不對時回傳 null
export async function addEventToCalendar(
  content: string,
): Promise<unknown | null> {
  const parsed = parseScheduleText(content);
  if (!parsed) {
    console.log("日期格式無法解析，略過建立日曆事件:", content);
    return null;
  }

  const calendarId = process.env["GOOGLE_CALENDAR_ID"];
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID is not set");

  const auth = makeAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: parsed.title,
      start: {
        dateTime: parsed.start.toISOString(),
        timeZone: "Asia/Taipei",
      },
      end: {
        dateTime: parsed.end.toISOString(),
        timeZone: "Asia/Taipei",
      },
    },
  });

  return res.data;
}
