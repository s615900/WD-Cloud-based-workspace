/**
 * 只重新上傳圖文選單圖片（不重建選單、不改按鈕）
 * 執行方式：cd artifacts/api-server && node scripts/upload-rich-menu-images.js
 *
 * MENU_ID 要換成 setup-rich-menu.js 執行完印出來的選單 ID
 * （改版面／改按鈕要重跑 setup-rich-menu.js 建新選單，這支只換圖片本身）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MENU_ID = "richmenu-247ea83953824b97790b3ada8c9602ac";

const TOKEN = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
if (!TOKEN) { console.error("LINE_CHANNEL_ACCESS_TOKEN 未設定"); process.exit(1); }

async function uploadImage(richMenuId, imagePath) {
  const buf = fs.readFileSync(imagePath);
  const res = await fetch(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "image/png",
      },
      body: buf,
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`上傳失敗 (${res.status}): ${txt}`);
  }
  return res.json();
}

const img = path.join(__dirname, "richmenu_sport.png");

console.log("上傳選單圖片…");
await uploadImage(MENU_ID, img);
console.log("  ✅ 選單圖片已更新");

console.log("\n完成！重新開啟 LINE 聊天視窗即可看到新圖片。");
