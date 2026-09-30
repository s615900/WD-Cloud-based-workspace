/**
 * 一次性腳本：建立單頁圖文選單（Rich Menu），2×3 共 6 顆按鈕，全部 postback。
 * 執行方式：
 *   cd artifacts/api-server
 *   node scripts/setup-rich-menu.js
 *
 * 圖片尺寸：2500×1686，上下各 843px 兩排內容，每列按鈕寬度：833 / 833 / 834
 *
 * W-009 改版（2026-08-31）：下排三顆從「message」類型改成「postback」＋displayText——
 * 原本的 message 類型會在聊天室留下使用者自己送出的文字訊息氣泡（例如「今日待辦」），
 * postback 配 displayText 一樣會在聊天室顯示同樣的文字，但不是真的送出訊息，畫面更乾淨。
 * 版面也從「新增／查詢」改成兩列都是常用功能：
 *   左上 今天 → action=today
 *   中上 待確認預約 → action=pending_bookings
 *   右上 新增行程 → action=pending&type=行程（沿用既有 datetimepicker 流程，不變）
 *   左下 未完成事項 → action=incomplete
 *   中下 查詢空檔 → action=freeslots_query
 *   右下 新增空檔 → action=pending&type=空檔（沿用既有兩段 datetimepicker 流程，不變）
 * 「新增待辦」「今日待辦」兩格拿掉（今日待辦併入「今天」；新增待辦已無對應格位，
 * 文字指令「待辦 內容」／「備忘 內容」仍可用）。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { messagingApi } from "@line/bot-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 常數 ──────────────────────────────────────────────────────
const W = 2500;
const H = 1686;
const ROW_H = H / 2;      // 843
const COL_W = 833;        // 833 / 833 / 834
const COL_W_LAST = W - COL_W * 2; // 834

const ALIAS_MAIN = "richmenu-alias-main";
// 舊版分頁式選單留下的 alias，改版時順手清掉，避免留下沒人指的殘留物
const OLD_ALIASES = ["richmenu-alias-add", "richmenu-alias-query"];

// ── Rich Menu 定義 ────────────────────────────────────────────

const mainMenu = {
  size: { width: W, height: H },
  selected: true,
  name: "記事機器人選單",
  chatBarText: "選單",
  areas: [
    // ── 上排 ──
    // 今天：今日行程＋今日空檔，不含未完成事項
    { bounds: { x: 0,         y: 0, width: COL_W,      height: ROW_H },
      action: { type: "postback", label: "今天", data: "action=today", displayText: "今天" } },
    // 待確認預約：唯一需要 WD 主動處理的項目
    { bounds: { x: COL_W,     y: 0, width: COL_W,      height: ROW_H },
      action: { type: "postback", label: "待確認預約", data: "action=pending_bookings", displayText: "待確認預約" } },
    // 新增行程（沿用既有 datetimepicker 流程，data 不變）
    { bounds: { x: COL_W * 2, y: 0, width: COL_W_LAST, height: ROW_H },
      action: { type: "postback", label: "新增行程", data: "action=pending&type=行程", displayText: "新增行程" } },

    // ── 下排 ──
    { bounds: { x: 0,         y: ROW_H, width: COL_W,      height: ROW_H },
      action: { type: "postback", label: "未完成事項", data: "action=incomplete", displayText: "未完成事項" } },
    { bounds: { x: COL_W,     y: ROW_H, width: COL_W,      height: ROW_H },
      action: { type: "postback", label: "查詢空檔", data: "action=freeslots_query", displayText: "查詢空檔" } },
    // 新增空檔（沿用既有兩段 datetimepicker 流程，data 不變）
    { bounds: { x: COL_W * 2, y: ROW_H, width: COL_W_LAST, height: ROW_H },
      action: { type: "postback", label: "新增空檔", data: "action=pending&type=空檔", displayText: "新增空檔" } },
  ],
};

// ── 主程序 ────────────────────────────────────────────────────

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");

  const client     = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });

  // 1. 清理舊別名（分頁式版本留下的 add/query alias，以及這個選單自己的 alias 若已存在）
  console.log("1. 清理舊別名...");
  for (const alias of [...OLD_ALIASES, ALIAS_MAIN]) {
    try { await client.deleteRichMenuAlias(alias); console.log(`   刪除別名 ${alias}`); }
    catch { /* 不存在，跳過 */ }
  }

  // 2. 清理舊預設選單
  console.log("2. 清理舊預設選單...");
  try { await client.cancelDefaultRichMenu(); }
  catch { /* 沒有預設，跳過 */ }

  // 3. 建立選單
  console.log("3. 建立選單...");
  const result = await client.createRichMenu(mainMenu);
  const menuId = typeof result === "string" ? result : result.richMenuId;
  console.log(`   選單 ID: ${menuId}`);

  // 4. 上傳圖片
  console.log("4. 上傳選單圖片...");
  const imgPath = path.join(__dirname, "richmenu_sport.png");
  const img = fs.readFileSync(imgPath);
  await blobClient.setRichMenuImage(menuId, new Blob([img], { type: "image/png" }));
  console.log("   上傳完成");

  // 5. 建立別名（方便之後只換圖片時可以用 upload-rich-menu-images.js 更新）
  console.log("5. 建立別名...");
  await client.createRichMenuAlias({ richMenuAliasId: ALIAS_MAIN, richMenuId: menuId });
  console.log("   別名建立完成");

  // 6. 設為預設
  console.log("6. 設為預設選單...");
  await client.setDefaultRichMenu(menuId);

  console.log("\n✅ 完成！打開手機 LINE 聊天視窗應該會看到新的圖文選單。");
  console.log("   如果沒立刻出現，關掉 LINE 重開，或等待幾秒鐘。");
  console.log(`   選單 ID：${menuId}（升級 upload-rich-menu-images.js 時會用到）`);
}

main().catch((err) => {
  console.error("\n❌ 設定失敗:", err?.message ?? err);
  if (err?.response) {
    err.response.text().then(t => console.error("API 回應:", t)).catch(() => {});
  }
  process.exit(1);
});
