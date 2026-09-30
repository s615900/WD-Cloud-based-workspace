import type { messagingApi } from "@line/bot-sdk";
import { FLEX_COLORS as C } from "../constants";

interface TaskItem {
  id: number;
  title: string;
  time: string; // e.g. "6/2 上午 9:00"
  status: "準備中" | "完成";
  type: "行程" | "備忘";
  // 排班行程（/ragicforms21/8）沒有「標記完成」動作，false 時不給可點擊的完成圓圈，
  // 避免打 postback action=complete 誤更新 /ragicforms21/1 裡同編號的無關紀錄。
  // 未設定視同 true（一般備忘）。
  completable?: boolean;
}

export function buildTaskListFlex(title: string, tasks: TaskItem[]): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: C.navy,
      paddingAll: "16px",
      contents: [
        { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "md", flex: 1 },
        { type: "text", text: "🌊", size: "md", align: "end" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "md",
      contents: tasks.slice(0, 8).map((t) => ({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        // 整列可點擊：圓圈本身只是裝飾用的 box，沒有 action 就點了完全沒反應；
        // 已完成的項目不需要再點一次，不綁 action。
        ...(t.status === "完成" || t.completable === false
          ? {}
          : { action: { type: "postback", data: `action=complete&ragicId=${t.id}` } }),
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: "20px",
            height: "20px",
            cornerRadius: "10px",
            borderWidth: "2px",
            borderColor: C.navy,
            backgroundColor: t.status === "完成" ? C.navy : "#FFFFFF",
            contents: [],
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              { type: "text", text: t.title, weight: "bold", size: "sm", color: C.text, wrap: true },
              {
                type: "box",
                layout: "horizontal",
                spacing: "xs",
                margin: "xs",
                contents: [
                  { type: "text", text: t.time, size: "xxs", color: C.sub, flex: 0 },
                  {
                    type: "text",
                    text: t.status,
                    size: "xxs",
                    color: t.status === "完成" ? C.statusDone : C.statusDoing,
                    align: "end",
                  },
                ],
              },
            ],
          },
        ],
      })),
    },
  };

  return { type: "flex", altText: title, contents: bubble };
}

interface ScheduleItem {
  day: string; // "6月2日 星期二"
  title: string;
  time: string; // "11:00–12:00" or "整天"
  dotColor: string; // hex
}

export function buildScheduleFlex(items: ScheduleItem[]): messagingApi.FlexMessage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Flex 巢狀結構動態組成
  const rows: any[] = [];
  let lastDay = "";
  for (const item of items) {
    if (item.day !== lastDay) {
      rows.push({
        type: "text",
        text: item.day,
        weight: "bold",
        size: "xs",
        color: C.navy,
        margin: rows.length ? "md" : "none",
      });
      lastDay = item.day;
    }
    rows.push({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "sm",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: "8px",
          height: "8px",
          cornerRadius: "4px",
          backgroundColor: item.dotColor,
          contents: [],
        },
        { type: "text", text: item.title, size: "sm", weight: "bold", flex: 1, wrap: true },
        { type: "text", text: item.time, size: "xxs", color: C.sub, align: "end" },
      ],
    });
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: C.navy,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "今日行程", color: "#FFFFFF", weight: "bold", size: "md", flex: 1 },
        { type: "text", text: "🌊", size: "md", align: "end" },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: rows },
  };

  return { type: "flex", altText: "今日行程", contents: bubble };
}

interface FreeSlotGroup {
  dayLabel: string; // "8月10日（一）"
  slots: { start: string; end: string }[];
}

// 查詢空檔：純檢視用的乾淨清單，只給「可預約」的時段（呼叫端已經用
// getBookableFreeSlots 篩過），不像 buildRecordRows 那樣帶完成按鈕——
// 空檔的「狀態」欄位跟預約與否無關，這裡不需要也不該有可互動元件。
export function buildFreeSlotListFlex(groups: FreeSlotGroup[]): messagingApi.FlexMessage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Flex 巢狀結構動態組成
  const rows: any[] = [];
  groups.forEach((g) => {
    if (g.slots.length === 0) return;
    rows.push({
      type: "text",
      text: g.dayLabel,
      weight: "bold",
      size: "xs",
      color: C.navy,
      margin: rows.length ? "md" : "none",
    });
    g.slots.forEach((s) => {
      rows.push({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "sm",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: "8px",
            height: "8px",
            cornerRadius: "4px",
            backgroundColor: "#6FCF97",
            contents: [],
          },
          { type: "text", text: `${s.start} - ${s.end}`, size: "sm", weight: "bold", flex: 1 },
        ],
      });
    });
  });

  if (rows.length === 0) {
    rows.push({ type: "text", text: "目前沒有可預約的空檔", size: "sm", color: C.sub });
  }

  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: C.navy,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "查詢空檔", color: "#FFFFFF", weight: "bold", size: "md", flex: 1 },
        { type: "text", text: "🕐", size: "md", align: "end" },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "16px", contents: rows },
  };

  return { type: "flex", altText: "可預約空檔", contents: bubble };
}

export function buildMemoConfirmFlex(content: string, createdAt: string): messagingApi.FlexMessage {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: C.navy,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "待辦已記下", color: "#FFFFFF", weight: "bold", size: "md", flex: 1 },
        { type: "text", text: "🌊", size: "md", align: "end" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: C.grayBg,
          cornerRadius: "12px",
          paddingAll: "12px",
          contents: [{ type: "text", text: content, size: "sm", wrap: true, color: C.text }],
        },
        { type: "text", text: createdAt, size: "xxs", color: C.sub, margin: "sm" },
      ],
    },
  };

  return { type: "flex", altText: "待辦已記下", contents: bubble };
}
