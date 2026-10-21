# 11｜Google 日曆雙向同步：Ragic 建欄位 + 排程設定

> 目前狀態：程式已完成。**在完成下面第 1、2、3 步之前**，行程只會單向寫進 Google（跟以前一樣），
> `/api/cron/google-sync` 會回 503。

## 同步範圍與規則

- 只同步「個人行程」（/ragicforms21/8），對象是 Google「待辦事項」日曆（`GOOGLE_CALENDAR_ID`）。班別、客戶預約不同步。
- 工作台新增／修改／刪除行程 → 即時推到 Google。「取消」行程 → Google 事件刪除；恢復 → 事件還原。
- Google 新增事件 → 排程每 10 分鐘匯入成行程；Google 修改 → 更新行程；Google 刪除 → 行程標「取消」（可恢復，不刪資料）。
- 兩邊內容不同時以 Google 為準（工作台的修改會即時推到 Google，所以排程看到的差異必定來自 Google 端）。
- 只處理過去 7 天～未來 180 天；循環事件不匯入；跨日事件只取開始那天（結束時間截到 23:59）。
- 對應關係存在行程的「Google事件ID」欄位。

## 1. Ragic 行程表新增欄位

在行程表（/ragicforms21/8）新增欄位：名稱「Google事件ID」（一字不差）、型態「文字」。
建好後到 API 說明頁查欄位編號，填進 `src/server/ragic/fields.ts` 的 `SCHEDULE_GCAL_FIELD_ID`（字串）。

## 2. 重新部署

填好欄位編號後 commit 並推到 GitHub，Vercel 會自動部署。

## 3. cron-job.org 新增排程

網址：`https://<WD 工作台網址>/api/cron/google-sync?key=<CRON_SECRET>`，每 10 分鐘一次（做法同 push-due）。
先用 `&dryRun=1` 看回傳內容，確認匯入／連結／補推的項目合理，再拿掉 dryRun。

第一次執行會把窗口內「還沒連結」的行程比對 Google：同日期＋同開始時間＋同標題的只建立連結，
其他舊行程補推到 Google。每次最多處理 25 筆，回傳 `truncated: true` 表示下一輪會接著做。
