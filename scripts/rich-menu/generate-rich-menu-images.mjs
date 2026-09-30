// 產生 richmenu_sport.png 的原始碼（單頁版：上排新增 3 顆／下排查詢 3 顆，共 6 顆，
// 不再分頁）。這張圖是純 SVG 畫出來再轉 PNG，跟 setup-rich-menu.js 裡的按鈕座標
// （ROW_H/COL_W）要保持一致，改版型時兩邊都要一起改。
//
// 重新產生圖片：
//   1. 這台機器要有中文字型可用（SVG 文字用 "Noto Sans CJK TC"），沒有的話文字會變成方框：
//      裝一套內建 Noto Sans CJK 字型到 fontconfig 找得到的路徑，例如：
//        mkdir -p "$XDG_DATA_HOME/fonts" && cp <NotoSansCJK-VF.otf.ttc 或任一 TC 字型檔> "$XDG_DATA_HOME/fonts/" && fc-cache -f
//   2. node scripts/generate-rich-menu-images.mjs   （在這個檔案所在目錄執行，會輸出一個 .svg）
//   3. magick richmenu_sport.svg richmenu_sport.png
//      （用 ImageMagick／librsvg 轉檔，確保輸出剛好是 2500x1686，不要用瀏覽器截圖，容易差幾個像素）
import fs from "node:fs";

const W = 2500, H = 1686, ROW_H = H / 2; // 843
const COL_W = 833, COL_W_LAST = W - COL_W * 2; // 833, 833, 834

const COLORS = {
  blue: "#1873D6",
  green: "#9ACD32",
  teal: "#17A398",
  orange: "#F2941F",
  yellow: "#F5C518",
  black: "#171717",
};

function shadowText(x, y, size, text) {
  return `
    <text x="${x + 6}" y="${y + 6}" font-family="Noto Sans CJK TC" font-weight="bold" font-size="${size}" fill="#000000" fill-opacity="0.35" text-anchor="middle">${text}</text>
    <text x="${x}" y="${y}" font-family="Noto Sans CJK TC" font-weight="bold" font-size="${size}" fill="#FFFFFF" text-anchor="middle">${text}</text>`;
}

// 3 條白色斜線裝飾，放在每顆按鈕右上角
function stripeAccent(originX, originY) {
  let s = "";
  for (let i = 0; i < 3; i++) {
    const off = i * 26;
    s += `<line x1="${originX - 90 + off}" y1="${originY + 130}" x2="${originX + 40 + off}" y2="${originY}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="14" stroke-linecap="round" />`;
  }
  return s;
}

// icon 都以 (cx, cy) 為中心繪製，白色，粗線條風格
const ICONS = {
  calendar: (cx, cy) => `
    <g transform="translate(${cx},${cy})" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
      <rect x="-95" y="-75" width="190" height="160" rx="20" />
      <line x1="-50" y1="-105" x2="-50" y2="-60" />
      <line x1="50" y1="-105" x2="50" y2="-60" />
      <line x1="-95" y1="-15" x2="95" y2="-15" />
    </g>`,
  pencil: (cx, cy) => `
    <g transform="translate(${cx},${cy}) rotate(-45)" stroke-linejoin="round">
      <polygon points="-115,-19 65,-19 115,0 65,19 -115,19" fill="#FFFFFF" />
      <line x1="60" y1="-19" x2="60" y2="19" stroke="#000000" stroke-opacity="0.25" stroke-width="8" />
    </g>`,
  clock: (cx, cy) => `
    <g transform="translate(${cx},${cy})" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="0" cy="0" r="92" />
      <line x1="0" y1="0" x2="0" y2="-58" stroke-width="14" />
      <line x1="0" y1="0" x2="42" y2="24" stroke-width="14" />
    </g>
    <circle cx="${cx}" cy="${cy}" r="10" fill="#FFFFFF" />`,
  sun: (cx, cy) => {
    let rays = "";
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const x1 = cx + Math.cos(a) * 78, y1 = cy + Math.sin(a) * 78;
      const x2 = cx + Math.cos(a) * 108, y2 = cy + Math.sin(a) * 108;
      rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" />`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="54" fill="#FFFFFF" />${rays}`;
  },
  hourglass: (cx, cy) => `
    <g transform="translate(${cx},${cy})" fill="none" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
      <path d="M -72 -95 L 72 -95 L 6 0 L 72 95 L -72 95 L -6 0 Z" />
      <line x1="-90" y1="-95" x2="90" y2="-95" stroke-width="20" />
      <line x1="-90" y1="95" x2="90" y2="95" stroke-width="20" />
    </g>`,
};

// x, y 是按鈕左上角座標；一顆按鈕固定佔一整個 COL_W(_LAST) x ROW_H 的格子
function button(x, y, color, iconKey, label, iconOffsetY = -160, labelY = 260) {
  const w = x === COL_W * 2 ? COL_W_LAST : COL_W;
  const cx = x + w / 2;
  const cy = y + ROW_H / 2;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${ROW_H}" fill="${color}" />
      ${stripeAccent(x + w - 60, y + 40)}
      ${ICONS[iconKey](cx, cy + iconOffsetY)}
      ${shadowText(cx, cy + labelY, 66, label)}
    </g>`;
}

function svgDoc(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}

// 上排（y=0）：新增行程／新增待辦／新增空檔 — 藍／綠／青
// 下排（y=ROW_H）：今日待辦／未完成事項／查詢空檔 — 橘／黃／青
const menuSvg = svgDoc(`
  ${button(0, 0, COLORS.blue, "calendar", "新增行程")}
  ${button(COL_W, 0, COLORS.green, "pencil", "新增待辦")}
  ${button(COL_W * 2, 0, COLORS.teal, "clock", "新增空檔")}
  ${button(0, ROW_H, COLORS.orange, "sun", "今日待辦")}
  ${button(COL_W, ROW_H, COLORS.yellow, "hourglass", "未完成事項")}
  ${button(COL_W * 2, ROW_H, COLORS.teal, "clock", "查詢空檔")}
`);

const __dirname = new URL(".", import.meta.url).pathname;
fs.writeFileSync(`${__dirname}richmenu_sport.svg`, menuSvg);
console.log("SVG written to", __dirname);
