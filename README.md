# 代辦及行事曆（Next.js 版）

原本 `代辦及行事曆/`（Replit pnpm monorepo：Express 5 API + 靜態 HTML 頁面）改寫成 **Next.js 16 App Router + Tailwind CSS v4** 的單一專案。
後端商業邏輯（Ragic、LINE Bot、Google 日曆、空檔推算）原封不動搬過來，只把 Express 路由換成 Route Handlers、HTML 頁面換成 React 元件。

## 開發

```bash
cp .env.example .env.local   # 填入實際金鑰
npm install
npm run dev                  # http://localhost:3000
npm run typecheck            # 型別檢查
npm run lint
npm test                     # 空檔推算／公布文字的單元測試（node --test）
npm run build && npm start   # 正式環境
```

## 目錄結構

```
src/
├─ proxy.ts                 # 登入保護（取代 Express requireAuth，Next 16 的 middleware）
├─ app/
│  ├─ layout.tsx / globals.css   # 全站外框、Tailwind 主題 token 與共用元件樣式
│  ├─ desktop/              # 桌面版個人工作台（需登入）
│  │  ├─ page.tsx           # 首頁
│  │  ├─ calendar/ tasks/ clients/ projects/ settings/
│  │  ├─ quotes/            # 列表、new、[id] 詳情、[id]/edit
│  │  └─ contracts/         # 列表、new、[id] 詳情、[id]/edit
│  ├─ (public)/             # 免登入頁面：book、share、quote-sign、contract-sign
│  ├─ no-access/
│  ├─ auth/                 # LINE Login：login、callback、logout
│  ├─ webhook/              # LINE Bot webhook
│  └─ api/                  # 所有 REST API（Route Handlers）
├─ components/              # Sidebar、Modal、徽章、富文字編輯器、簽名板…
├─ lib/                     # 前端共用：apiFetch、日期工具、型別、模組鎖定 hook
└─ server/                  # 只在伺服器端執行
   ├─ bot/ ragic/ lib/      # 從原專案搬過來的商業邏輯（幾乎未改動）
   ├─ modules/              # 原本散在 Express 路由裡的共用函式
   ├─ http.ts               # Route Handler 小工具（json、readBody、模組鎖定 423）
   └─ session.ts            # 簽章 cookie session（與原本 cookie-parser 格式相容）
```

## 網址對照（舊網址會自動 308 轉址，見 `next.config.ts`）

| 原本 | 現在 |
| --- | --- |
| `/desktop/index.html` | `/desktop` |
| `/desktop/calendar.html` 等 | `/desktop/calendar` 等 |
| `/desktop/quotes-detail.html?id=5` | `/desktop/quotes/5` |
| `/desktop/quotes-new.html?id=5` | `/desktop/quotes/5/edit` |
| `/book.html`、`/share.html` | `/book`、`/share` |
| `/quote-sign.html?token=…` | `/quote-sign?token=…` |
| API（`/api/*`）、`/webhook`、`/auth/*` | 路徑不變 |

## 部署注意

- 請用會長時間執行的 Node 伺服器（`next start`，例如 Replit、Zeabur、Railway、自架 VPS）。
  LINE Bot 的「等待輸入」狀態與預約防重複鎖存在記憶體裡，Serverless（如 Vercel）的多個 instance 之間不共享。
- 接案商業模組的暫停開關在 `src/server/lib/businessLock.ts`。
- LINE Developers 後台的 Webhook URL 仍是 `https://你的網域/webhook`，Callback URL 是 `/auth/callback`。
