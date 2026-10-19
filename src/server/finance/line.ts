// LINE 文字指令（不加 Rich Menu，只走文字）：
//   記 午餐 120 ／ 記 午餐 120 CUBE   → 支出（第三段可指定帳戶名稱）
//   收 接案 15000                      → 收入
//   本月                               → 本月收支摘要 Flex 卡
//   待繳                               → 30 天內待付款 Flex 卡
// 只有 LINE_USER_ID（本人）能用；其他人打同樣的字不會被攔截，維持原本機器人的行為。

import type { messagingApi } from "@line/bot-sdk";
import type { AccountItem, CategoryItem, DueItem } from "@/lib/financeTypes";
import { todayYMD } from "@/server/modules/dates";
import { buildOverview, loadContext } from "./engine";
import { parseFinanceCommand } from "./lineParse";
import { FinanceError, createTransaction } from "./service";
import { ACCOUNT_TYPE, CATEGORY_KIND, TX_TYPE } from "./ragicFields";

// 分類：摘要剛好等於分類名稱 → 用它；否則依關鍵字猜；猜不到用「其他支出／其他收入」
const KEYWORDS: Record<string, string[]> = {
  餐飲: ["早餐", "午餐", "晚餐", "宵夜", "餐", "飯", "麵", "咖啡", "飲料", "手搖", "便當", "吃"],
  交通: ["捷運", "公車", "高鐵", "台鐵", "火車", "計程車", "uber", "加油", "油錢", "停車", "機車", "車資", "ubike"],
  居住: ["房租", "水費", "電費", "瓦斯", "管理費", "網路"],
  通訊: ["電信", "手機費", "網卡", "月租"],
  器材: ["鏡頭", "相機", "器材", "記憶卡", "電池", "腳架"],
  醫療: ["看醫生", "掛號", "藥", "診所", "醫院"],
  娛樂: ["電影", "遊戲", "訂閱", "netflix", "spotify", "KTV"],
  保險: ["保費", "保險"],
};

export function pickCategory(summary: string, kind: "expense" | "income", categories: CategoryItem[]): string | null {
  const want = kind === "expense" ? CATEGORY_KIND.支出 : CATEGORY_KIND.收入;
  const usable = categories.filter((c) => c.active && c.kind === want);
  const exact = usable.find((c) => summary.includes(c.name));
  if (exact) return exact.name;
  if (kind === "expense") {
    const lower = summary.toLowerCase();
    for (const [name, words] of Object.entries(KEYWORDS)) {
      if (words.some((w) => lower.includes(w.toLowerCase())) && usable.some((c) => c.name === name)) return name;
    }
  }
  const other = kind === "expense" ? "其他支出" : "其他收入";
  return usable.find((c) => c.name === other)?.name ?? null;
}

export function pickAccount(hint: string, accounts: AccountItem[]): AccountItem | null {
  const active = accounts.filter((a) => a.active);
  if (!hint) return active.find((a) => a.isDefault) ?? null;
  const h = hint.toLowerCase();
  return active.find((a) => a.code.toLowerCase() === h) ?? active.find((a) => a.name.toLowerCase().includes(h)) ?? null;
}

const text = (t: string): messagingApi.TextMessage => ({ type: "text", text: t });
const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

// 回傳要回覆的訊息；不是財務指令（或不是本人）回 null，讓原本的機器人流程繼續
export async function handleFinanceText(userId: string, raw: string): Promise<messagingApi.Message[] | null> {
  const owner = process.env["LINE_USER_ID"];
  if (!owner || userId !== owner) return null;
  const cmd = parseFinanceCommand(raw);
  if (!cmd) return null;

  try {
    const today = todayYMD();
    if (cmd.kind === "month") {
      const ov = buildOverview(await loadContext(), today);
      return [monthFlex(ov.month, ov.summary, ov.expenseByCategory)];
    }
    if (cmd.kind === "due") {
      const ctx = await loadContext();
      return [dueFlex(buildOverview(ctx, today).dues)];
    }

    const ctx = await loadContext();
    const account = pickAccount(cmd.accountHint, ctx.accounts);
    if (!account) {
      return [
        text(
          cmd.accountHint
            ? `找不到帳戶「${cmd.accountHint}」。可用帳戶：${ctx.accounts.filter((a) => a.active).map((a) => a.name).join("、") || "（尚未建立）"}`
            : "還沒有設定「預設記帳」帳戶，請到網頁版「帳戶與分類」設定，或指令最後加上帳戶名稱，例如：記 午餐 120 現金",
        ),
      ];
    }
    const category = pickCategory(cmd.summary, cmd.kind, ctx.categories);
    if (!category) return [text("還沒有收支分類，請先到網頁版「帳戶與分類」按「建立預設分類」")];

    const { code } = await createTransaction({
      date: today,
      type: cmd.kind === "expense" ? TX_TYPE.支出 : TX_TYPE.收入,
      amount: cmd.amount,
      account: account.code,
      category,
      summary: cmd.summary,
    });
    return [text(`✅ 已記${cmd.kind === "expense" ? "支出" : "收入"}\n${cmd.summary} ${fmt(cmd.amount)}\n分類：${category}　帳戶：${account.name}${account.type === ACCOUNT_TYPE.信用卡 ? "（信用卡）" : ""}\n編號 ${code}`)];
  } catch (err) {
    if (err instanceof FinanceError) return [text(`記帳失敗：${err.message}`)];
    console.error("財務指令失敗:", err);
    return [text("糟糕，記帳時發生問題，請稍後再試一次")];
  }
}

// ── Flex 卡片（個人財務配色，不用接案系統的藍金）──

const INK = "#1f2933";
const MUTED = "#6b7280";
const ACCENT = "#0f766e";
const INCOME = "#15803d";
const EXPENSE = "#b91c1c";

function row(label: string, value: string, color = INK): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: MUTED, flex: 3 },
      { type: "text", text: value, size: "sm", color, align: "end", weight: "bold", flex: 4 },
    ],
  };
}

function header(title: string): messagingApi.FlexBox {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: ACCENT,
    paddingAll: "14px",
    contents: [{ type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "md" }],
  };
}

export function monthFlex(
  month: string,
  summary: { income: number; expense: number; net: number },
  byCategory: { category: string; amount: number }[],
): messagingApi.FlexMessage {
  const top = byCategory.slice(0, 5).map((c) => row(c.category, fmt(c.amount)));
  return {
    type: "flex",
    altText: `${month} 收支：收入 ${fmt(summary.income)}、支出 ${fmt(summary.expense)}`,
    contents: {
      type: "bubble",
      header: header(`${month} 本月收支`),
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          row("收入", fmt(summary.income), INCOME),
          row("支出", fmt(summary.expense), EXPENSE),
          row("結餘（不含轉帳）", fmt(summary.net)),
          ...(top.length > 0
            ? [{ type: "separator", margin: "md" } as messagingApi.FlexComponent, { type: "text", text: "支出前幾名", size: "xs", color: MUTED, margin: "md" } as messagingApi.FlexComponent, ...top]
            : []),
        ],
      },
    },
  };
}

export function dueFlex(dues: DueItem[]): messagingApi.FlexMessage {
  const when = (d: number) => (d < 0 ? `已逾 ${-d} 天` : d === 0 ? "今天" : `${d} 天後`);
  const items: messagingApi.FlexComponent[] =
    dues.length === 0
      ? [{ type: "text", text: "30 天內沒有待付款項目 🎉", size: "sm", color: MUTED, wrap: true }]
      : dues.slice(0, 12).map((d) => ({
          type: "box",
          layout: "vertical",
          margin: "sm",
          contents: [
            row(`${d.date.slice(5).replace("-", "/")} ${d.title}`, fmt(d.amount), d.daysLeft < 0 ? EXPENSE : INK),
            { type: "text", text: `${d.kind}・${when(d.daysLeft)}${d.detail ? `・${d.detail}` : ""}`, size: "xs", color: MUTED },
          ],
        }));
  return {
    type: "flex",
    altText: dues.length === 0 ? "30 天內沒有待付款項目" : `30 天內有 ${dues.length} 筆待付款`,
    contents: {
      type: "bubble",
      header: header("30 天內待付款"),
      body: { type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm", contents: items },
    },
  };
}
