// 分頁式圖文選單（Rich Menu）設定腳本 — 「新增」／「查詢」兩個分頁，用 richmenu alias +
// richmenuswitch action 切換，仿照台灣迪卡儂官方帳號那種上方分頁列的做法。
// 只需要執行一次，不是常駐服務。重複執行時會自動更新既有的 alias（不會重複建立）。
//
// 精簡版（新增 3 顆／查詢 3 顆，各一列）：「網址」類型移出 Rich Menu（純文字指令
// 「網址 內容」仍保留在後端，只是不再佔選單版面），查詢分頁的「查詢全部／查詢行程／
// 查詢備忘」三顆同樣移出（文字指令照樣可用），改成「空檔」新增／查詢兩顆功能。
//
// 使用前準備：
//   1. 準備兩張 2500 x 1686 像素的 PNG 圖片，放在 workspace 根目錄：
//      richmenu_add.png   — 新增分頁（頂部 150px 是分頁列，下面三等分：新增行程／新增備忘／新增空檔）
//      richmenu_query.png — 查詢分頁（頂部 150px 是分頁列，下面三等分：
//                            今日待辦／未完成事項／查詢空檔）
//   2. 確保 Replit Secrets 已經有 LINE_CHANNEL_ACCESS_TOKEN
//
// 執行方式（在 artifacts/api-server 目錄下）：node scripts/setup-rich-menu.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { messagingApi } from "@line/bot-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

const ALIAS_ADD = "menu_add";
const ALIAS_QUERY = "menu_query";

const accessToken = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: accessToken,
});
const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: accessToken,
});

// 分頁列：頂部 150px，左半新增／右半查詢，兩邊都是 richmenuswitch，
// 各自固定切去對應分頁（不管現在在哪一個選單上，點「新增」永遠切去新增分頁，點「查詢」永遠切去查詢分頁）
function tabBarAreas() {
  return [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 150 },
      action: {
        type: "richmenuswitch",
        richMenuAliasId: ALIAS_ADD,
        data: "action=switchTab&to=add",
      },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 150 },
      action: {
        type: "richmenuswitch",
        richMenuAliasId: ALIAS_QUERY,
        data: "action=switchTab&to=query",
      },
    },
  ];
}

// 新增分頁：扣掉頂部 150px，剩餘 1536 高，橫向三等分 833/833/834
const addMenuRequest = {
  size: { width: 2500, height: 1686 },
  selected: false,
  name: "記事機器人選單－新增",
  chatBarText: "選單",
  areas: [
    ...tabBarAreas(),
    {
      bounds: { x: 0, y: 150, width: 833, height: 1536 },
      action: { type: "postback", label: "新增行程", data: "action=pending&type=行程" },
    },
    {
      bounds: { x: 833, y: 150, width: 833, height: 1536 },
      action: { type: "postback", label: "新增備忘", data: "action=pending&type=備忘" },
    },
    {
      bounds: { x: 1666, y: 150, width: 834, height: 1536 },
      action: { type: "postback", label: "新增空檔", data: "action=pending&type=空檔" },
    },
  ],
};

// 查詢分頁：扣掉頂部 150px，剩餘 1536 高，橫向三等分 833/833/834（跟新增分頁同版型）
const queryMenuRequest = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "記事機器人選單－查詢",
  chatBarText: "選單",
  areas: [
    ...tabBarAreas(),
    {
      bounds: { x: 0, y: 150, width: 833, height: 1536 },
      action: { type: "message", label: "今日待辦", text: "今日待辦" },
    },
    {
      bounds: { x: 833, y: 150, width: 833, height: 1536 },
      action: { type: "message", label: "未完成事項", text: "未完成事項" },
    },
    {
      bounds: { x: 1666, y: 150, width: 834, height: 1536 },
      action: { type: "message", label: "查詢空檔", text: "查詢空檔" },
    },
  ],
};

async function createAndUpload(request, imageFileName) {
  const imagePath = path.resolve(WORKSPACE_ROOT, imageFileName);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`找不到圖片: ${imagePath}`);
  }

  console.log(`建立圖文選單「${request.name}」中...`);
  const { richMenuId } = await client.createRichMenu(request);
  console.log(`已建立，richMenuId: ${richMenuId}`);

  console.log(`上傳選單圖片 ${imageFileName} 中...`);
  const imageBuffer = fs.readFileSync(imagePath);
  await blobClient.setRichMenuImage(
    richMenuId,
    new Blob([imageBuffer], { type: "image/png" }),
  );
  console.log("圖片上傳完成");

  return richMenuId;
}

// alias 已存在就更新指向新的 richMenuId，不存在才建立，讓腳本可以重複執行
async function upsertAlias(aliasId, richMenuId) {
  try {
    await client.createRichMenuAlias({ richMenuAliasId: aliasId, richMenuId });
    console.log(`已建立 alias「${aliasId}」→ ${richMenuId}`);
  } catch (err) {
    console.log(`alias「${aliasId}」已存在，改成更新指向 ${richMenuId}`);
    await client.updateRichMenuAlias(aliasId, { richMenuId });
  }
}

async function main() {
  const addMenuId = await createAndUpload(addMenuRequest, "richmenu_add.png");
  const queryMenuId = await createAndUpload(queryMenuRequest, "richmenu_query.png");

  console.log("設定 richmenu alias 中...");
  await upsertAlias(ALIAS_ADD, addMenuId);
  await upsertAlias(ALIAS_QUERY, queryMenuId);

  console.log("設為預設選單（查詢分頁）中...");
  await client.setDefaultRichMenu(queryMenuId);

  console.log("完成！打開手機 LINE 應該就能看到分頁式選單了");
  console.log(`新增分頁 richMenuId: ${addMenuId}`);
  console.log(`查詢分頁 richMenuId: ${queryMenuId}`);
}

main().catch((err) => {
  console.error("設定圖文選單失敗:", err);
  process.exitCode = 1;
});
