// LINE Flex Message builders — 依照類型給不同顏色
import type { messagingApi } from "@line/bot-sdk";
import { formatContentForDisplay } from "./ragic";
import type { ScheduleEntry } from "../ragic/schedule";
import type { FreeSlot } from "../ragic/freeSlots";

const TYPE_COLORS: Record<string, string> = {
  行程: "#D85A30",
  備忘: "#378ADD",
  圖片: "#7F77DD",
  空檔: "#2E9E83",
};

function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? "#888780";
}

// 「備忘」是內部沿用的類型值（Ragic 欄位不變），顯示給使用者看的文字一律用「待辦」
function labelForType(type: string): string {
  return type === "備忘" ? "待辦" : type;
}

// 狀態圓角標籤的顏色（沒有對應狀態就不顯示標籤，例如圖片沒有狀態欄位）
const STATUS_COLORS: Record<string, string> = {
  準備中: "#F5A623",
  完成: "#2ECC71",
};

// 小圓角色塊標籤，共用在類型／狀態上
function chip(text: string, backgroundColor: string): Record<string, unknown> {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor,
    cornerRadius: "6px",
    paddingAll: "4px",
    paddingStart: "8px",
    paddingEnd: "8px",
    flex: 0,
    contents: [
      {
        type: "text",
        text,
        size: "xxs",
        color: "#FFFFFF",
        weight: "bold",
        align: "center",
        gravity: "center",
      },
    ],
  };
}

export interface BotRecord {
  type: string;
  content: string;
  matched?: boolean;
}

export interface RagicRecord {
  _ragicId: number;
  類型: string;
  內容文字: string;
  狀態: string;
  建立時間: string;
  截止日期: string;
  預約人姓名?: string;
  預約狀態?: string;
  預約時間戳記?: string;
  // 排班行程（/ragicforms21/8）轉接成這個形狀給清單卡片顯示用時帶 false——這類紀錄
  // 沒有「標記完成」的動作，且用同一個 id 打 PATCH /api/tasks/:id 或 LINE「完成」指令
  // 會誤打到 /ragicforms21/1 裡剛好同編號的無關紀錄，一律不給完成按鈕。
  // 未設定（一般 /1 紀錄）視同 true。
  _completable?: boolean;
}

// 存檔成功後的確認訊息（單張卡片）
export function buildConfirmationFlex(
  record: BotRecord,
): messagingApi.FlexMessage {
  const now = new Date().toLocaleString("zh-TW", { hour12: false });

  return {
    type: "flex",
    altText: `已記錄【${labelForType(record.type)}】${record.content}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: labelForType(record.type),
            weight: "bold",
            size: "sm",
            color: colorForType(record.type),
          },
          {
            type: "text",
            text: formatContentForDisplay(record.type, record.content),
            wrap: true,
            size: "md",
            margin: "md",
          },
          {
            type: "text",
            text: now,
            size: "xs",
            color: "#AAAAAA",
            margin: "md",
          },
        ],
      },
    } as messagingApi.FlexContainer,
  };
}

// 「新增行程」第一步：請使用者用 LINE 內建的日期時間選擇器挑選行程時間
export function buildTripDatePickerFlex(): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "請選擇行程日期時間",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "新增行程", weight: "bold", size: "md", color: colorForType("行程") },
          { type: "text", text: "請選擇行程的日期與時間", size: "sm", color: "#888888", wrap: true },
          {
            type: "button",
            style: "primary",
            color: colorForType("行程"),
            action: {
              type: "datetimepicker",
              label: "選擇日期時間",
              data: "action=add_trip_date",
              mode: "datetime",
            },
          },
        ],
      },
    } as messagingApi.FlexContainer,
  };
}

// 「新增空檔」第一步：跟新增行程一樣，用 LINE 內建的日期時間選擇器挑開始日期時間
export function buildFreeSlotStartPickerFlex(): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "請選擇空檔開始時間",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "新增空檔", weight: "bold", size: "md", color: colorForType("空檔") },
          { type: "text", text: "請選擇空檔的日期與開始時間", size: "sm", color: "#888888", wrap: true },
          {
            type: "button",
            style: "primary",
            color: colorForType("空檔"),
            action: {
              type: "datetimepicker",
              label: "選擇開始時間",
              data: "action=add_freeslot_start",
              mode: "datetime",
            },
          },
        ],
      },
    } as messagingApi.FlexContainer,
  };
}

// 「新增空檔」第二步：空檔限定同一天，所以只需要再選一次時間（不用重選日期），
// 用 min 把選擇範圍限制在開始時間之後，避免選出結束早於開始
export function buildFreeSlotEndPickerFlex(startTime: string): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "請選擇空檔結束時間",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "新增空檔", weight: "bold", size: "md", color: colorForType("空檔") },
          { type: "text", text: "請選擇空檔的結束時間", size: "sm", color: "#888888", wrap: true },
          {
            type: "button",
            style: "primary",
            color: colorForType("空檔"),
            action: {
              type: "datetimepicker",
              label: "選擇結束時間",
              data: "action=add_freeslot_end",
              mode: "time",
              initial: startTime,
              min: startTime,
              max: "23:59",
            },
          },
        ],
      },
    } as messagingApi.FlexContainer,
  };
}

// 把一批紀錄轉成清單卡片裡的列（含類型／狀態標籤、內容、完成按鈕、列間分隔線），
// buildListFlex 和 buildDailyReminderFlex 共用
function buildRecordRows(records: RagicRecord[]): Record<string, unknown>[] {
  const items = records.slice(0, 10);
  const rows: Record<string, unknown>[] = [];

  items.forEach((r, index) => {
    const statusColor = STATUS_COLORS[r["狀態"]];

    // 上排：類型／狀態標籤
    const labelRow: Record<string, unknown>[] = [
      chip(labelForType(r["類型"]), colorForType(r["類型"])),
    ];
    if (statusColor) {
      labelRow.push(chip(r["狀態"], statusColor));
    }

    // 下排：內容文字，「準備中」的項目右邊加完成按鈕
    const contentRow: Record<string, unknown>[] = [
      {
        type: "text",
        text: formatContentForDisplay(r["類型"], r["內容文字"]),
        size: "sm",
        wrap: true,
        flex: 1,
        gravity: "center",
      },
    ];
    if (r["狀態"] === "準備中" && r["_completable"] !== false) {
      contentRow.push({
        type: "button",
        style: "secondary",
        height: "sm",
        flex: 0,
        gravity: "center",
        action: {
          type: "postback",
          label: "完成",
          data: `action=complete&ragicId=${r["_ragicId"]}`,
        },
      });
    }

    rows.push({
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          alignItems: "center",
          contents: labelRow,
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          alignItems: "center",
          contents: contentRow,
        },
      ],
    });

    // 每一列之間加分隔線，最後一列不用加
    if (index < items.length - 1) {
      rows.push({
        type: "separator",
        margin: "lg",
        color: "#EDEDED",
      });
    }
  });

  return rows;
}

// 查詢結果清單（一張卡片裡列多筆）
export function buildListFlex(
  records: RagicRecord[],
  filterType: string | null,
  titleOverride?: string,
  emptyMessage = "目前沒有符合的紀錄",
): messagingApi.FlexMessage {
  const title =
    titleOverride ?? (filterType ? `查詢結果：${filterType}` : "查詢結果：全部");

  const rows = buildRecordRows(records);

  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#3A3A4C",
        paddingAll: "md",
        contents: [
          { type: "text", text: `📋 ${title}`, weight: "bold", size: "md", color: "#FFFFFF" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents:
          rows.length > 0
            ? rows
            : [
                {
                  type: "text",
                  text: emptyMessage,
                  size: "sm",
                  color: "#AAAAAA",
                },
              ],
      },
    } as messagingApi.FlexContainer,
  };
}

// 分節小標題，用在每日提醒卡片裡「今日待辦」／「未完成事項」兩個區塊上方
function sectionHeader(text: string): Record<string, unknown> {
  return {
    type: "text",
    text,
    weight: "bold",
    size: "sm",
    color: "#3A3A4C",
  };
}

// 「今日行程」「今日空檔」用：純時間列表，不帶類型／狀態標籤與完成按鈕
// （跟 buildRecordRows 的清單卡片風格刻意區分開，這兩區塊沒有「完成」的概念）。
function timeRangeRow(timeLabel: string, title?: string): Record<string, unknown> {
  const contents: Record<string, unknown>[] = [
    { type: "text", text: timeLabel, size: "sm", weight: "bold", color: "#3A3A4C", flex: 0 },
  ];
  if (title) {
    contents.push({ type: "text", text: title, size: "sm", wrap: true, flex: 1, margin: "md" });
  }
  return { type: "box", layout: "horizontal", contents };
}

// 依開始時間排序（呼叫端已用 getScheduleForDate 排序過，這裡不重算，只是不假設順序）
function buildScheduleRows(entries: ScheduleEntry[]): Record<string, unknown>[] {
  return [...entries]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => timeRangeRow(e.allDay ? "全天" : `${e.start} – ${e.end}`, e.title));
}

// 空檔直接照傳入順序渲染，不重新計算、不重新排序（推算結果本身已排序，見 getFreeSlotsForDate）
function buildFreeSlotRows(slots: FreeSlot[]): Record<string, unknown>[] {
  return slots.map((s) => timeRangeRow(`${s.start} – ${s.end}`));
}

function emptySectionText(text: string): Record<string, unknown> {
  return { type: "text", text, size: "sm", color: "#AAAAAA" };
}

// 「今日行程」「今日空檔」兩個區塊（含標題、分隔線、空狀態文字），
// buildDailyReminderFlex（W-007 已驗收，這裡抽出來後行為必須維持一致）與
// buildTodayFlex（W-009 Rich Menu「今天」格）共用，避免兩處各自維護一份重複邏輯。
function buildScheduleAndFreeSlotSections(
  todaySchedule: ScheduleEntry[],
  freeSlots: FreeSlot[],
): Record<string, unknown>[] {
  const contents: Record<string, unknown>[] = [];

  contents.push(sectionHeader("📅 今日行程"));
  contents.push(
    ...(todaySchedule.length > 0 ? buildScheduleRows(todaySchedule) : [emptySectionText("今天沒有行程")]),
  );

  contents.push({ type: "separator", margin: "xl", color: "#DDDDDD" });
  contents.push(sectionHeader("🕒 今日空檔"));
  contents.push(
    ...(freeSlots.length > 0 ? buildFreeSlotRows(freeSlots) : [emptySectionText("今天沒有空檔")]),
  );

  return contents;
}

// 每日主動推播提醒：合併「今日行程」「今日空檔」「未完成事項」三個區塊成一張卡片。
// 前兩個區塊即使沒有資料也要顯示區塊標題＋空狀態文字（不得整張卡片靜默不發），
// 「未完成事項」維持原本行為：沒有資料就整個區塊不顯示。
export function buildDailyReminderFlex(
  todaySchedule: ScheduleEntry[],
  freeSlots: FreeSlot[],
  incompleteRecords: RagicRecord[],
): messagingApi.FlexMessage {
  const bodyContents = buildScheduleAndFreeSlotSections(todaySchedule, freeSlots);

  if (incompleteRecords.length > 0) {
    bodyContents.push({ type: "separator", margin: "xl", color: "#DDDDDD" });
    bodyContents.push(sectionHeader(`⏳ 未完成事項（${incompleteRecords.length}）`));
    bodyContents.push(...buildRecordRows(incompleteRecords));
  }

  return {
    type: "flex",
    altText: `早安！今日行程 ${todaySchedule.length} 筆・空檔 ${freeSlots.length} 段・未完成 ${incompleteRecords.length} 筆`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#3A3A4C",
        paddingAll: "md",
        contents: [
          { type: "text", text: "☀️ 早安！今日提醒", weight: "bold", size: "md", color: "#FFFFFF" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: bodyContents,
      },
    } as messagingApi.FlexContainer,
  };
}

// Rich Menu「今天」格：跟每日提醒卡片內容一致（今日行程／今日空檔），但不含未完成事項
// 區塊——未完成事項是 Rich Menu 另一顆獨立的格子，避免重複。
export function buildTodayFlex(
  todaySchedule: ScheduleEntry[],
  freeSlots: FreeSlot[],
): messagingApi.FlexMessage {
  const bodyContents = buildScheduleAndFreeSlotSections(todaySchedule, freeSlots);

  return {
    type: "flex",
    altText: `今天：行程 ${todaySchedule.length} 筆・空檔 ${freeSlots.length} 段`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#3A3A4C",
        paddingAll: "md",
        contents: [{ type: "text", text: "📅 今天", weight: "bold", size: "md", color: "#FFFFFF" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: bodyContents,
      },
    } as messagingApi.FlexContainer,
  };
}

// 一列「標籤：值」，預約請求卡片的預約人／日期／時段三行共用
function labelValueRow(label: string, value: string): Record<string, unknown> {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#AAAAAA", flex: 2 },
      { type: "text", text: value, size: "sm", weight: "bold", color: "#3A3A4C", flex: 5, wrap: true },
    ],
  };
}

// 預約請求卡片的 bubble 本體（標題列／預約人／日期／時段／確認・拒絕按鈕），
// buildBookingRequestFlex（單筆推播，book.ts 既有用法，輸出不變）與
// buildPendingBookingsFlex（W-009 Rich Menu「待確認預約」格，多筆用 carousel 呈現）共用，
// 避免兩處各自維護一份重複的按鈕組裝邏輯。
function buildBookingRequestBubble(
  name: string,
  dayLabel: string,
  start: string,
  end: string,
  ragicId: number | string,
): messagingApi.FlexBubble {
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3A3A4C",
      paddingAll: "md",
      contents: [
        { type: "text", text: "📩 新的預約請求", weight: "bold", size: "md", color: "#FFFFFF" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        labelValueRow("預約人", name),
        labelValueRow("日期", dayLabel),
        labelValueRow("時段", `${start} – ${end}`),
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#2ECC71",
          action: {
            type: "postback",
            label: "確認預約",
            data: `action=confirm_booking&ragicId=${ragicId}`,
          },
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "postback",
            label: "拒絕",
            data: `action=reject_booking&ragicId=${ragicId}`,
          },
        },
      ],
    },
  } as messagingApi.FlexBubble;
}

// 客戶送出預約後推播給 WD 的待確認卡片：深色標題列與每日提醒一致，兩個按鈕都是
// postback、帶這筆 /ragicforms21/1 的 record_id，讓 webhook 的
// action=confirm_booking／reject_booking 能直接查到對應紀錄。
export function buildBookingRequestFlex(
  name: string,
  dayLabel: string,
  start: string,
  end: string,
  ragicId: number | string,
): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: `新的預約請求：${name} ${dayLabel} ${start}-${end}`,
    contents: buildBookingRequestBubble(name, dayLabel, start, end, ragicId) as messagingApi.FlexContainer,
  };
}

export interface PendingBookingItem {
  ragicId: number | string;
  name: string;
  dayLabel: string;
  start: string;
  end: string;
}

// Rich Menu「待確認預約」格：多筆待確認記錄用 carousel（同一則訊息裡橫滑多張卡片）呈現，
// 每張卡片跟 buildBookingRequestFlex 單筆推播用的是同一個 bubble 組裝邏輯，
// 「確認預約」「拒絕」按鈕的 postback data 格式完全一致，直接複用 webhook 既有的
// action=confirm_booking／reject_booking 處理邏輯，不必另寫。呼叫端已篩過、限制筆數，
// 這裡不重新排序或截斷。
export function buildPendingBookingsFlex(items: PendingBookingItem[]): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: `待確認預約（${items.length} 筆）`,
    contents: {
      type: "carousel",
      contents: items.map((it) =>
        buildBookingRequestBubble(it.name, it.dayLabel, it.start, it.end, it.ragicId),
      ),
    } as messagingApi.FlexContainer,
  };
}
