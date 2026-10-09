# 09｜Web Push 推播：Ragic 建表 + 設定

> 目前狀態：程式已完成「訂閱／取消／測試通知／點擊通知」，**尚未設定**：
> `src/server/lib/pushRagic.ts` 的表單路徑與欄位編號是空字串，`/api/push/*` 一律回 503；
> 設定頁「推播通知」卡片會顯示錯誤。上線前要先完成第 1、2 步。
> 到期提醒排程 `/api/cron/push-due` 已完成；待辦「到期日」要先在 Ragic 多建一個欄位（見第 1-2 步）。

## 1. Ragic 建表（手動）

在 qsprint 帳號新增一張表單，名稱「推播訂閱」，4 個欄位（欄位名稱要一字不差，全部用「文字」型態）：

| 欄位名稱 | 型態 | 備註 |
| --- | --- | --- |
| 裝置名稱 | 文字 | iPhone／Mac… 只是方便在 Ragic 後台辨識 |
| endpoint | 文字 | 推播服務的網址，很長，用文字（不要用段落以外的型態），程式用它判斷是不是同一台裝置 |
| p256dh | 文字 | 加密公鑰 |
| auth | 文字 | 加密密碼 |

建好後把表單網址與四個欄位編號（API 說明頁）填進 `pushRagic.ts` 的 `PUSH_SHEET`、`PUSH_FIELD`。

### 1-2 待辦表（/ragicforms21/1）新增「到期日」欄位

在原本的待辦表單新增一個欄位：名稱「到期日」、型態「日期（yyyy/MM/dd）」。建好後把欄位編號填進
`src/server/bot/ragic.ts` 的 `FIELD_ID.到期日`。沒填之前：待辦頁照常使用，但設定到期日會回「尚未設定」，
到期日提醒也不會執行（行程開始前的提醒不受影響）。

## 2. Replit Secrets 新增 3 個變數

| 變數 | 內容 |
| --- | --- |
| `VAPID_PUBLIC_KEY` | 本機 `.env.local` 裡的同名值 |
| `VAPID_PRIVATE_KEY` | 本機 `.env.local` 裡的同名值（私鑰，不要外流） |
| `VAPID_SUBJECT` | `mailto:s615900@gmail.com` |

換金鑰後，所有裝置要重新按一次「開啟通知」。

## 3. 到期提醒排程（cron-job.org）

Replit Autoscale 沒有內建排程、沒流量時會縮到零，所以用外部服務定時呼叫，做法跟每日提醒相同：

1. 登入 cron-job.org →「CREATE CRONJOB」。
2. URL：`https://asset-manager-s615900.replit.app/api/cron/push-due?key=你的CRON_SECRET`（CRON_SECRET 就是 Replit Secrets 裡原本那個）。
3. Execution schedule：每 **15 分鐘**（Every 15 minutes）。時區選 Asia/Taipei。
4. 儲存。排程間隔一定要是 15 分鐘（程式預設檢查區間 15 分鐘）；要改間隔的話，網址加 `&windowMin=間隔分鐘數`。

提醒規則：
- 個人行程（有開始時間）：開始前 30 分鐘。
- 待辦有到期日、狀態還是「準備中」：到期當天 09:00（09:00～09:15 的那一次檢查）。

測試（不會真的發送）：網址加 `&dryRun=1&now=2026-10-09T08:50`，回傳這個時間點會提醒哪些項目。

## 4. 使用方式

1. iPhone：Safari 開網站 → 分享 → 加入主畫面 → 從主畫面圖示開啟（需 iOS 16.4 以上）。
2. 設定頁 → 推播通知 → 「開啟通知」→ 允許。
3. 「傳送測試通知」確認收得到；點通知會開啟待辦頁。
