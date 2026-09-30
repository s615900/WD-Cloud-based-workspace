// LINE Webhook 事件處理（原本 routes/webhook.ts 的邏輯，Express 部分改由 app/webhook/route.ts 負責）
//
// 注意：下面幾組「等待輸入」狀態只存在記憶體裡（單一 process）。用 `next start` 跑在單一
// Node 伺服器上行為跟原本一樣；如果改部署到 Serverless（例如 Vercel），不同請求可能落在不同
// instance，這些暫存狀態就不保證會延續。
import {
  messagingApi,
  type WebhookEvent,
  type MessageEvent,
  type PostbackEvent,
  type TextEventMessage,
  type ImageEventMessage,
} from "@line/bot-sdk";
import {
  saveRecordToRagic,
  queryRecordsFromRagic,
  queryTodayRecordsFromRagic,
  queryIncompleteRecordsFromRagic,
  updateRecordStatusInRagic,
  formatContentForDisplay,
  saveFreeSlotToRagic,
  getBookableFreeSlots,
  getPendingBookings,
  parseScheduleCommandText,
  scheduleEntryToRagicRecord,
  confirmBookingInRagic,
  rejectBookingInRagic,
  BookingNotFoundError,
  BookingAlreadyProcessedError,
} from "./ragic";
import { listAllSchedule, createSchedule, type ScheduleEntry } from "../ragic/schedule";
import {
  buildConfirmationFlex,
  buildListFlex,
  buildTripDatePickerFlex,
  buildFreeSlotStartPickerFlex,
  buildFreeSlotEndPickerFlex,
  buildTodayFlex,
  buildPendingBookingsFlex,
  type BotRecord,
  type RagicRecord,
} from "./flex";
import {
  buildTaskListFlex,
  buildScheduleFlex,
  buildMemoConfirmFlex,
  buildFreeSlotListFlex,
} from "./flexCards";
import { addEventToCalendar } from "./calendar";
import { formatDayLabel } from "../modules/dayLabel";
import { getScheduleForDate, getFreeSlotsForDate } from "../modules/roster";
import { getTodayYMD } from "./ragic";
import { classifyTextWithAI, describeImageWithAI } from "./ai";
import { AI_FEATURES_ENABLED } from "../lib/aiFeatures";

import { addDefaultDuration } from "../modules/dates";


// -----------------------------------------------------------------------
// 「等待輸入」狀態：使用者從 Rich Menu 點「新增待辦」後，
// 機器人記住這個人下一則訊息要當成哪種類型存檔，不需要再打關鍵字。
// 只存在記憶體裡（單一 process，重啟就清空），5 分鐘沒接著輸入就自動失效。
// 「新增行程」「新增空檔」都改走日期時間選擇器流程，見下面的 pendingTripDates／
// pendingFreeSlotStart。
type PendingType = "備忘";

const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingInputs = new Map<string, { type: PendingType; expiresAt: number }>();

const PENDING_PROMPT: Record<PendingType, string> = {
  備忘: "請直接輸入待辦內容，範例：記得帶護照",
};

function setPendingInput(userId: string, type: PendingType): void {
  pendingInputs.set(userId, { type, expiresAt: Date.now() + PENDING_TTL_MS });
}

// 取出還沒過期的等待狀態；過期或不存在就回傳 null，並順手清掉過期的紀錄
function takePendingType(userId: string): PendingType | null {
  const state = pendingInputs.get(userId);
  if (!state) return null;
  pendingInputs.delete(userId);
  if (Date.now() > state.expiresAt) return null;
  return state.type;
}

function clearPendingInput(userId: string): void {
  pendingInputs.delete(userId);
}

// -----------------------------------------------------------------------
// 「新增行程」流程：使用者先透過 datetimepicker 選日期時間（postback event，
// action=add_trip_date），選好後我們把日期時間暫存起來，等使用者接著輸入
// 行程內容的下一則文字訊息時，把日期時間跟內容組在一起存檔。
// 10 分鐘沒接著輸入內容就自動失效。
const TRIP_DATE_TTL_MS = 10 * 60 * 1000;
const pendingTripDates = new Map<string, { datetime: string; expiresAt: number }>();

function setPendingTripDate(userId: string, datetime: string): void {
  pendingTripDates.set(userId, { datetime, expiresAt: Date.now() + TRIP_DATE_TTL_MS });
}

// 回傳選好的日期時間；"expired" 表示曾經選過但已經逾時；null 表示根本沒有暫存
// （這種情況不影響其他指令判斷，呼叫方應該照原本邏輯繼續處理）
function takePendingTripDate(userId: string): { datetime: string } | "expired" | null {
  const state = pendingTripDates.get(userId);
  if (!state) return null;
  pendingTripDates.delete(userId);
  if (Date.now() > state.expiresAt) return "expired";
  return { datetime: state.datetime };
}

// 把 datetimepicker 回傳的 ISO 8601（例如 2026-07-30T14:00，沒有時區資訊，
// 就是使用者選的當地時間數字）轉成「M/D HH:mm」文字，直接照字面數字轉換，不透過 Date
// 物件計算，避免牽扯到時區換算。只給 addEventToCalendar（Google 日曆同步，維持它原本
// 期待的文字格式）用，不用來寫進 Ragic——寫 /ragicforms21/8 一律用下面拆出的結構化欄位。
function formatTripDateTime(isoDatetime: string): string {
  const match = isoDatetime.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return isoDatetime;
  const [, month, day, hour, minute] = match;
  return `${Number(month)}/${Number(day)} ${hour}:${minute}`;
}

// 把 datetimepicker 回傳的 ISO 8601 拆成 /ragicforms21/8 需要的結構化 date（yyyy-MM-dd）
// 與 start（HH:mm），照字面數字轉換，不透過 Date 物件計算。解析不出來回傳 null。
function parseTripDateTime(isoDatetime: string): { date: string; start: string } | null {
  const match = isoDatetime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const [, date, start] = match;
  return { date, start };
}

// -----------------------------------------------------------------------
// 「新增空檔」流程：跟新增行程一樣先用 datetimepicker 選開始日期時間（postback event，
// action=add_freeslot_start），選好後暫存，接著跳出第二張卡片（mode=time）選結束時間——
// 空檔限定同一天，所以第二步不用重選日期。10 分鐘沒接著選結束時間就自動失效。
const FREE_SLOT_START_TTL_MS = 10 * 60 * 1000;
const pendingFreeSlotStart = new Map<
  string,
  { date: string; start: string; expiresAt: number }
>();

function setPendingFreeSlotStart(userId: string, date: string, start: string): void {
  pendingFreeSlotStart.set(userId, { date, start, expiresAt: Date.now() + FREE_SLOT_START_TTL_MS });
}

// 回傳暫存的開始日期時間；"expired" 表示曾經選過但已經逾時；null 表示根本沒有暫存
function takePendingFreeSlotStart(
  userId: string,
): { date: string; start: string } | "expired" | null {
  const state = pendingFreeSlotStart.get(userId);
  if (!state) return null;
  pendingFreeSlotStart.delete(userId);
  if (Date.now() > state.expiresAt) return "expired";
  return { date: state.date, start: state.start };
}

// 把 datetimepicker（mode=datetime）回傳的 ISO 8601（例如 2026-07-30T14:00）拆成
// saveFreeSlotToRagic 需要的 date（YYYY-MM-DD）與 start（HH:MM），直接照字面數字轉換，
// 不透過 Date 物件計算，避免牽扯到時區換算（作法比照 formatTripDateTime）。
function parseFreeSlotStartDateTime(isoDatetime: string): { date: string; start: string } | null {
  const match = isoDatetime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  const [, date, start] = match;
  return { date, start };
}

// 「空檔」指令輸入格式：MM/DD HH:MM-HH:MM（例如 08/10 17:30-22:00）。
// 年份用今年（Asia/Taipei），跟這個 App 其他地方「同一年」的簡化假設一致
// （見 ragic.ts 的 taskSortTimestamp／recordCalendarDate）。解析不出來回傳 null。
function parseFreeSlotCommand(
  text: string,
): { date: string; start: string; end: string } | null {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const [, month, day, start, end] = match;
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric" }).format(
    new Date(),
  );
  return {
    date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    start,
    end,
  };
}

function makeClient(): messagingApi.MessagingApiClient {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env["LINE_CHANNEL_ACCESS_TOKEN"] ?? "",
  });
}

function makeBlobClient(): messagingApi.MessagingApiBlobClient {
  return new messagingApi.MessagingApiBlobClient({
    channelAccessToken: process.env["LINE_CHANNEL_ACCESS_TOKEN"] ?? "",
  });
}

// -----------------------------------------------------------------------

export async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type === "postback") {
    const pbEvent = event as PostbackEvent;
    const userId = pbEvent.source.userId ?? "unknown";
    await handlePostbackEvent(
      pbEvent.replyToken,
      userId,
      pbEvent.postback.data,
      pbEvent.postback.params,
    );
    return;
  }

  if (event.type !== "message") return;

  const msgEvent = event as MessageEvent;
  const { replyToken, message, source } = msgEvent;
  const userId = source.userId ?? "unknown";

  if (message.type === "text") {
    await handleTextMessage(replyToken, userId, (message as TextEventMessage).text);
  } else if (message.type === "image") {
    await handleImageMessage(replyToken, userId, (message as ImageEventMessage).id);
  }
}

// 處理 postback：清單卡片的「完成」按鈕（action=complete&ragicId=17）、
// Rich Menu 上排「新增」按鈕（action=pending&type=行程/備忘/空檔）、
// 「新增行程」的日期時間選擇器（action=add_trip_date），
// 「新增空檔」的兩步驟日期時間選擇器（action=add_freeslot_start／add_freeslot_end）、
// 預約待確認卡片的「確認預約」／「拒絕」按鈕（action=confirm_booking／reject_booking
// &ragicId=17，見 bot/flex.ts 的 buildBookingRequestFlex）。
// Rich Menu 下排「查詢」是純文字訊息按鈕，不會觸發 postback，見 handleTextMessage。
async function handlePostbackEvent(
  replyToken: string,
  userId: string,
  data: string,
  postbackParams?: PostbackEvent["postback"]["params"],
): Promise<void> {
  const client = makeClient();
  const params = new URLSearchParams(data);
  const action = params.get("action");

  if (action === "add_trip_date") {
    const datetime =
      postbackParams && "datetime" in postbackParams ? postbackParams.datetime : undefined;
    if (!datetime) return;

    setPendingTripDate(userId, datetime);
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: "請輸入行程內容" }],
    });
    return;
  }

  if (action === "add_freeslot_start") {
    const datetime =
      postbackParams && "datetime" in postbackParams ? postbackParams.datetime : undefined;
    if (!datetime) return;
    const parsed = parseFreeSlotStartDateTime(datetime);
    if (!parsed) return;

    setPendingFreeSlotStart(userId, parsed.date, parsed.start);
    await client.replyMessage({
      replyToken,
      messages: [buildFreeSlotEndPickerFlex(parsed.start)],
    });
    return;
  }

  if (action === "add_freeslot_end") {
    const time = postbackParams && "time" in postbackParams ? postbackParams.time : undefined;
    if (!time) return;

    const pending = takePendingFreeSlotStart(userId);
    if (pending === "expired") {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "操作逾時，請重新點選新增空檔" }],
      });
      return;
    }
    if (!pending) return;

    if (time <= pending.start) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "結束時間必須晚於開始時間，請重新點選新增空檔" }],
      });
      return;
    }

    try {
      await saveFreeSlotToRagic(pending.date, pending.start, time);
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `已新增空檔：${pending.date.replaceAll("-", "/")} ${pending.start}–${time}（下次完整公布時會重新推算，此筆將被覆蓋）`,
          },
        ],
      });
    } catch (err) {
      console.error("處理空檔存檔時發生錯誤:", err);
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "糟糕，剛剛存檔時發生問題，請稍後再試一次" }],
      });
    }
    return;
  }

  if (action === "pending") {
    const type = params.get("type");
    if (type !== "行程" && type !== "備忘" && type !== "空檔") return;

    if (type === "行程") {
      await client.replyMessage({
        replyToken,
        messages: [buildTripDatePickerFlex()],
      });
      return;
    }

    if (type === "空檔") {
      await client.replyMessage({
        replyToken,
        messages: [buildFreeSlotStartPickerFlex()],
      });
      return;
    }

    setPendingInput(userId, type);
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: PENDING_PROMPT[type] }],
    });
    return;
  }

  // Rich Menu（W-009 2×3 改版）四顆查詢類格子：今天／待確認預約／未完成事項／查詢空檔。
  // 都是唯讀查詢，直接複用既有的查詢函式與卡片組裝——跟原本文字指令
  // （今日待辦／未完成事項／查詢空檔，見 handleTextMessage）用同一套邏輯，只是改由
  // postback 觸發，讓聊天室不會留下使用者自己送出的文字訊息氣泡。
  if (action === "today") {
    const today = getTodayYMD();
    const [todaySchedule, freeSlots] = await Promise.all([
      getScheduleForDate(today),
      getFreeSlotsForDate(today),
    ]);
    if (freeSlots === null) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "糟糕，空檔設定尚未建立，請先完成設定" }],
      });
      return;
    }
    await client.replyMessage({
      replyToken,
      messages: [buildTodayFlex(todaySchedule, freeSlots)],
    });
    return;
  }

  if (action === "pending_bookings") {
    const pending = await getPendingBookings();
    if (pending.length === 0) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "目前沒有待確認的預約" }],
      });
      return;
    }
    await client.replyMessage({
      replyToken,
      messages: [
        buildPendingBookingsFlex(
          pending.map((p) => ({
            ragicId: p.ragicId,
            name: p.name,
            dayLabel: formatDayLabel(p.date),
            start: p.start,
            end: p.end,
          })),
        ),
      ],
    });
    return;
  }

  if (action === "incomplete") {
    const incompleteRecords = await queryIncompleteRecordsFromRagic(userId);
    if (incompleteRecords.length === 0) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "目前沒有未完成事項" }],
      });
      return;
    }
    await client.replyMessage({
      replyToken,
      messages: [buildTaskListFlex("未完成事項", toTaskItems(incompleteRecords))],
    });
    return;
  }

  if (action === "freeslots_query") {
    const groups = await getBookableFreeSlots();
    await client.replyMessage({
      replyToken,
      messages: [
        buildFreeSlotListFlex(groups.map((g) => ({ dayLabel: formatDayLabel(g.date), slots: g.slots }))),
      ],
    });
    return;
  }

  if (action === "confirm_booking" || action === "reject_booking") {
    const ragicId = params.get("ragicId");
    if (!ragicId) return;

    try {
      if (action === "confirm_booking") {
        const result = await confirmBookingInRagic(ragicId);
        const label = `${formatDayLabel(result.date)} ${result.start}–${result.end}`;
        const syncNote = result.calendarSynced ? "" : "（行事曆同步失敗，請手動確認）";
        await client.replyMessage({
          replyToken,
          messages: [
            { type: "text", text: `已確認 ${result.name} 的預約：${label}，已加入行事曆${syncNote}` },
          ],
        });
      } else {
        const result = await rejectBookingInRagic(ragicId);
        const label = `${formatDayLabel(result.date)} ${result.start}–${result.end}`;
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: `已拒絕 ${result.name} 的預約：${label}，時段已釋出` }],
        });
      }
    } catch (err) {
      if (err instanceof BookingAlreadyProcessedError) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: "這筆預約已處理過" }],
        });
        return;
      }
      if (err instanceof BookingNotFoundError) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: "找不到這筆預約紀錄" }],
        });
        return;
      }
      console.error("處理預約審核時發生錯誤:", err);
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "糟糕，處理預約時發生問題，請稍後再試一次" }],
      });
    }
    return;
  }

  if (action !== "complete") return;

  const ragicId = params.get("ragicId");
  if (!ragicId) return;

  try {
    const message = await completeRecord(userId, ragicId);
    await client.replyMessage({ replyToken, messages: [{ type: "text", text: message }] });
  } catch (err) {
    console.error("標記完成時發生錯誤:", err);
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: "糟糕，標記完成時發生問題，請稍後再試一次" }],
    });
  }
}

// 標記完成共用邏輯：清單卡片的「完成」postback、純文字指令「完成 編號」都呼叫這裡，
// 確保兩種進入方式行為一致——先從這位使用者自己的紀錄裡找到該筆（確認歸屬並取得內容文字
// 用來回覆），再把狀態寫回 Ragic。找不到紀錄時回傳訊息而不丟例外，讓呼叫端當成正常回覆處理；
// Ragic API 本身失敗則往外丟，交給呼叫端各自的 catch 顯示「系統忙碌」訊息。
async function completeRecord(userId: string, ragicId: string): Promise<string> {
  const records = await queryRecordsFromRagic(userId, null);
  const target = records.find((r) => String(r["_ragicId"]) === ragicId);
  if (!target) {
    return "找不到這筆紀錄，可能已經被刪除或標記過了";
  }
  await updateRecordStatusInRagic(ragicId, "完成");
  return `已標記完成：${target["內容文字"]}`;
}

// -----------------------------------------------------------------------
// Ragic 紀錄 → flexCards.ts 卡片 props 的轉換

function toTaskItems(records: RagicRecord[]): Parameters<typeof buildTaskListFlex>[1] {
  return records.map((r) => ({
    id: r["_ragicId"],
    title: formatContentForDisplay(r["類型"], r["內容文字"]),
    time: r["建立時間"],
    status: r["狀態"] === "完成" ? "完成" : "準備中",
    type: r["類型"] === "行程" ? "行程" : "備忘",
    completable: r["_completable"] !== false,
  }));
}

// 排班行程（/ragicforms21/8）的日期／開始時間／結束時間都是結構化欄位，不用解析內容文字。
// 班別（套模板／批次建立）帶模板顏色；個人行程（LINE／手動新增）沒有顏色，沿用舊版固定的
// 一般行程色 #2A5C8A。
function toScheduleItems(entries: ScheduleEntry[]): Parameters<typeof buildScheduleFlex>[0] {
  return entries
    .slice()
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((e) => {
      const [, month, day] = e.date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
      const weekday = new Intl.DateTimeFormat("zh-TW", {
        weekday: "long",
        timeZone: "Asia/Taipei",
      }).format(new Date(`${e.date}T00:00:00+08:00`));

      return {
        day: month && day ? `${Number(month)}月${Number(day)}日 ${weekday}` : e.date,
        title: e.title,
        time: e.allDay ? "整天" : `${e.start}-${e.end}`,
        dotColor: e.color || "#2A5C8A",
      };
    });
}

async function handleTextMessage(
  replyToken: string,
  userId: string,
  text: string,
): Promise<void> {
  const client = makeClient();

  // 「新增行程」流程的第二步：先檢查是否有尚未過期的暫存日期時間，
  // 有的話這則訊息一律當成行程內容，不管內容長什麼樣都不交給下面的關鍵字判斷。
  const pendingTripDate = takePendingTripDate(userId);
  if (pendingTripDate === "expired") {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text: "操作逾時，請重新點選新增行程" }],
    });
    return;
  }
  if (pendingTripDate) {
    const parsed = parseTripDateTime(pendingTripDate.datetime);
    if (!parsed) {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "操作逾時，請重新點選新增行程" }],
      });
      return;
    }
    const title = text.trim() || "行程";
    try {
      await createSchedule({
        userId,
        kind: "個人行程",
        date: parsed.date,
        start: parsed.start,
        end: addDefaultDuration(parsed.start),
        title,
        status: "正常",
      });
      try {
        await addEventToCalendar(`${formatTripDateTime(pendingTripDate.datetime)} ${title}`);
      } catch (calErr) {
        console.error("建立Google日曆事件失敗:", calErr);
      }
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "已新增行程" }],
      });
    } catch (err) {
      console.error("處理行程存檔時發生錯誤:", err);
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: "糟糕，剛剛存檔時發生問題，請稍後再試一次" }],
      });
    }
    return;
  }

  let record: BotRecord = classifyText(text);

  if (record.matched) {
    // 打了明確關鍵字指令（查詢、說明...），優先蓋過等待輸入狀態並清除，避免卡住
    clearPendingInput(userId);
  } else {
    const pendingType = takePendingType(userId);
    if (pendingType) {
      // 使用者正處於「等待輸入 XX 內容」狀態，這則訊息直接當成該類型的內容存檔
      record = { type: pendingType, content: text.trim(), matched: true };
    } else if (AI_FEATURES_ENABLED) {
      // 沒有等待狀態、也沒對到關鍵字，交給 AI 判斷（AI 停用時直接沿用預設備忘錄）
      try {
        record = await classifyTextWithAI(text);
      } catch (err) {
        console.error("AI分類失敗，改用預設備忘錄:", err);
      }
    }
  }

  try {
    if (record.type === "說明") {
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "使用方式：\n行程 07/30 14:00 內容 → 記錄行程\n待辦 內容 → 記錄待辦\n直接傳圖片 → 記錄截圖\n查詢 / 查詢 行程 / 查詢 待辦 → 查看紀錄",
          },
        ],
      });
      return;
    }

    if (record.type === "查詢") {
      const filterType = record.content || null;

      if (filterType === "行程") {
        const scheduleEntries = await listAllSchedule();
        // 只帶「個人行程」——班別／客戶預約是排班資料，不是待辦事項，跟 queryTasksForApi
        // 的待辦頁篩選同一條規則（班別資訊由每日提醒的「今日行程」區塊負責顯示）。
        const mine = scheduleEntries.filter(
          (e) => e.userId === userId && e.status !== "取消" && e.kind === "個人行程",
        );
        await client.replyMessage({
          replyToken,
          messages: [buildScheduleFlex(toScheduleItems(mine))],
        });
        return;
      }

      const records = await queryRecordsFromRagic(userId, filterType);
      let incomplete = records.filter((r) => r["狀態"] !== "完成");

      // 不篩類型（查詢 全部）：/ragicforms21/1 的備忘之外，也把排班行程一起帶出來，
      // 跟原本「查詢」不分類型就顯示所有紀錄的行為一致；同樣只帶「個人行程」，
      // 排除班別與客戶預約。
      if (filterType === null) {
        const scheduleEntries = await listAllSchedule();
        const scheduleAsRecords = scheduleEntries
          .filter((e) => e.userId === userId && e.kind === "個人行程")
          .map(scheduleEntryToRagicRecord)
          .filter((r) => r["狀態"] !== "完成");
        incomplete = [...incomplete, ...scheduleAsRecords];
      }

      // 「備忘」是內部沿用的類型值，卡片標題顯示給使用者看的文字要用「待辦」
      const filterLabel = filterType === "備忘" ? "待辦" : filterType;
      const titleOverride = filterLabel ? `查詢結果：${filterLabel}` : undefined;
      await client.replyMessage({
        replyToken,
        messages: [buildListFlex(incomplete, filterType, titleOverride, "目前沒有未完成項目")],
      });
      return;
    }

    if (record.type === "新增行程") {
      await client.replyMessage({
        replyToken,
        messages: [buildTripDatePickerFlex()],
      });
      return;
    }

    if (record.type === "新增指引") {
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: "請輸入：\n行程 07/30 14:00 內容 → 新增行程\n待辦 內容 → 新增待辦\n直接傳圖片 → 新增截圖",
          },
        ],
      });
      return;
    }

    if (record.type === "今日待辦") {
      const todayRecords = await queryTodayRecordsFromRagic(userId);
      const incompleteToday = todayRecords.filter((r) => r["狀態"] !== "完成");
      await client.replyMessage({
        replyToken,
        messages: [buildTaskListFlex("今日待辦事項", toTaskItems(incompleteToday))],
      });
      return;
    }

    if (record.type === "完成") {
      const ragicId = record.content;
      if (!/^\d+$/.test(ragicId)) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: "請輸入正確格式：完成 編號（例如：完成 17）" }],
        });
        return;
      }
      const message = await completeRecord(userId, ragicId);
      await client.replyMessage({ replyToken, messages: [{ type: "text", text: message }] });
      return;
    }

    if (record.type === "空檔") {
      const parsed = parseFreeSlotCommand(record.content);
      if (!parsed) {
        await client.replyMessage({
          replyToken,
          messages: [
            { type: "text", text: "請輸入正確格式：空檔 日期 時段，例如：空檔 08/10 17:30-22:00" },
          ],
        });
        return;
      }
      await saveFreeSlotToRagic(parsed.date, parsed.start, parsed.end);
      await client.replyMessage({
        replyToken,
        messages: [
          {
            type: "text",
            text: `已新增空檔：${parsed.date.replaceAll("-", "/")} ${parsed.start}-${parsed.end}`,
          },
        ],
      });
      return;
    }

    if (record.type === "查詢空檔") {
      const groups = await getBookableFreeSlots();
      await client.replyMessage({
        replyToken,
        messages: [
          buildFreeSlotListFlex(
            groups.map((g) => ({ dayLabel: formatDayLabel(g.date), slots: g.slots })),
          ),
        ],
      });
      return;
    }

    if (record.type === "未完成事項") {
      const incompleteRecords = await queryIncompleteRecordsFromRagic(userId);
      if (incompleteRecords.length === 0) {
        await client.replyMessage({
          replyToken,
          messages: [{ type: "text", text: "目前沒有未完成的事項" }],
        });
        return;
      }
      await client.replyMessage({
        replyToken,
        messages: [buildTaskListFlex("未完成事項", toTaskItems(incompleteRecords))],
      });
      return;
    }

    if (record.type === "行程") {
      const parsed = parseScheduleCommandText(record.content);
      if (!parsed) {
        await client.replyMessage({
          replyToken,
          messages: [
            { type: "text", text: "請輸入正確格式：行程 07/30 14:00 內容，或改用「新增行程」選日期時間" },
          ],
        });
        return;
      }
      await createSchedule({
        userId,
        kind: "個人行程",
        date: parsed.date,
        start: parsed.time,
        end: addDefaultDuration(parsed.time),
        title: parsed.title,
        status: "正常",
      });
      try {
        await addEventToCalendar(record.content);
      } catch (calErr) {
        console.error("建立Google日曆事件失敗:", calErr);
      }
      await client.replyMessage({
        replyToken,
        messages: [buildConfirmationFlex(record)],
      });
      return;
    }

    // 備忘（待辦）→ 存進 Ragic
    await saveRecordToRagic(userId, record);

    if (record.type === "備忘") {
      await client.replyMessage({
        replyToken,
        messages: [
          buildMemoConfirmFlex(record.content, new Date().toLocaleString("zh-TW", { hour12: false })),
        ],
      });
      return;
    }

    await client.replyMessage({
      replyToken,
      messages: [buildConfirmationFlex(record)],
    });
  } catch (err) {
    console.error("處理訊息時發生錯誤:", err);
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "糟糕，剛剛存檔或查詢時發生問題，請稍後再試一次",
        },
      ],
    });
  }
}

async function handleImageMessage(
  replyToken: string,
  userId: string,
  messageId: string,
): Promise<void> {
  const client = makeClient();
  const blobClient = makeBlobClient();

  let description = "（AI辨識已暫時停用，僅記錄為截圖/照片）";

  if (AI_FEATURES_ENABLED) {
    try {
      const stream = await blobClient.getMessageContent(messageId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const imageBuffer = Buffer.concat(chunks);
      console.log(`收到圖片，大小: ${imageBuffer.length} bytes`);
      description = await describeImageWithAI(imageBuffer);
    } catch (err) {
      console.error("圖片AI辨識失敗:", err);
    }
  }

  const record: BotRecord = { type: "圖片", content: description };

  try {
    await saveRecordToRagic(userId, record);
    await client.replyMessage({
      replyToken,
      messages: [buildConfirmationFlex(record)],
    });
  } catch (err) {
    console.error("圖片紀錄存檔失敗:", err);
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: "text",
          text: "圖片辨識成功，但存檔時發生問題，請稍後再試一次",
        },
      ],
    });
  }
}

// 依照開頭關鍵字判斷這則文字要存成哪一種類型
function classifyText(text: string): BotRecord {
  const trimmed = text.trim();

  if (trimmed === "新增行程")
    return { type: "新增行程", content: "", matched: true };
  if (trimmed.startsWith("行程"))
    return { type: "行程", content: trimmed.replace(/^行程\s*/, ""), matched: true };
  // 「備忘」是內部沿用的類型值（Ragic 欄位不變），使用者這邊看到、打的字都改成「待辦」，
  // 兩個關鍵字都接受，避免舊使用習慣的人打「備忘」突然失效。
  if (trimmed.startsWith("待辦") || trimmed.startsWith("備忘"))
    return { type: "備忘", content: trimmed.replace(/^(待辦|備忘)\s*/, ""), matched: true };
  if (trimmed === "查詢空檔")
    return { type: "查詢空檔", content: "", matched: true };
  if (trimmed.startsWith("空檔"))
    return { type: "空檔", content: trimmed.replace(/^空檔\s*/, "").trim(), matched: true };
  if (trimmed.startsWith("查詢") || trimmed.startsWith("清單"))
    return {
      type: "查詢",
      content: trimmed.replace(/^(查詢|清單)\s*/, "").replace(/^待辦$/, "備忘"),
      matched: true,
    };
  if (trimmed.startsWith("完成"))
    return { type: "完成", content: trimmed.replace(/^完成\s*/, "").trim(), matched: true };
  if (trimmed === "說明")
    return { type: "說明", content: "", matched: true };
  if (trimmed === "新增事項")
    return { type: "新增指引", content: "", matched: true };
  if (trimmed === "今日待辦")
    return { type: "今日待辦", content: "", matched: true };
  if (trimmed === "未完成事項")
    return { type: "未完成事項", content: "", matched: true };

  // 兜底：沒對到關鍵字，讓呼叫方決定是否送 AI
  return { type: "備忘", content: trimmed, matched: false };
}

