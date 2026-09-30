# 02 — Claude Code 實作指示（行事曆：班別模板、重複排班、空檔推算）

> ⚠️ **本檔為還原版，非原文逐字稿。**
> 第四、九節內容由使用者於前一輪 session 中對照原文逐字轉錄，可信度高，但上線前需抽驗
> 兩三個欄位編號（至 Ragic 設計模式核對）。
> 第五節僅有演算法本體與六行案例摘要，具體輸入／預期輸出由 Claude Code 依此重新定義，
> 已交還使用者核對（見 docs/05-空檔推算單元測試案例.md，或本檔案第五節補述區塊）。

---

## 四、欄位編號常數

集中放在 `src/ragic/fields.ts`，不要讓欄位編號散落成字串：

```ts
export const SHEET = {
  todo:     '/ragicforms21/1',
  template: '/ragicforms21/6',
  config:   '/ragicforms21/7',
  schedule: '/ragicforms21/8',
} as const;

export const F_TEMPLATE = {
  code: 1001399, name: 1001400, start: 1001401, end: 1001402,
  color: 1001403, order: 1001404, active: 1001405,
} as const;

export const F_CONFIG = {
  name: 1001407, dayStart: 1001408, dayEnd: 1001409,
  bufferBefore: 1001410, bufferAfter: 1001411, minSlot: 1001412,
  roundTo: 1001413, publishDays: 1001414, bookingUrl: 1001415,
} as const;

export const F_SCHEDULE = {
  code: 1001417, userId: 1001418, kind: 1001419, date: 1001420,
  start: 1001422, end: 1001423, title: 1001424, allDay: 1001425,
  status: 1001426, templateCode: 1001427, batchId: 1001428,
  color: 1001429, location: 1001430, note: 1001431,
} as const;
```

**GET 回應用中文欄位名當 key，POST / PATCH 用上面的數字編號。** 這兩者不對稱，混用會造成
API 回成功但欄位空白的靜默失敗。

### 更正：`date`（1001420）是 Ragic 原生日期欄位，不是純文字

實測結果：`/ragicforms21/8` 的「日期」欄位是 Ragic 原生日期型別，不是純文字欄位。

- **POST / PATCH** 送 `"2026-09-01"`（`yyyy-MM-dd`）進去會被接受。
- **GET** 讀回來的值會變成 `"2026/09/01"`（`yyyy/MM/dd`，Ragic 自己的顯示格式），
  寫入端送的分隔符號會被忽略、Ragic 一律用 `/` 顯示。

**所有拿這個欄位做字串比對的地方，都必須先正規化成同一種分隔符號，否則會靜默撈不到
資料（API 不報錯，條件式比對就是不成立）**，包括但不限於：

- `GET /roster/schedule?date=` 的日期篩選
- 空檔推算讀「當日／前一日」行程時的日期比對
- 月曆依日期分組

實作已在 `src/ragic/schedule.ts` 的 `normalizeRagicDate()` 統一處理：讀回資料時把
`yyyy/MM/dd`（或任何 `/`、`-` 混用的情況）一律轉回 `yyyy-MM-dd`，讓 `ScheduleEntry.date`
在讀寫兩端保持一致。之後新增任何用日期字串比對的邏輯，一律使用 `listAllSchedule()`
回傳的正規化後的值，不要直接拿 Ragic GET 的原始欄位值做比對。

### 編號連續性檢查（還原正確性佐證）

- `1001406` 未出現在 `F_CONFIG` → 應為 `/7` 主表單 key
- `1001421` 未出現在 `F_SCHEDULE` → `02` 文件明確寫「排班行程主表單 Key：`1001421`」
- `F_SCHEDULE` 從 `1001417` 起算，`date` 為 `1001420`、`start` 為 `1001422`，中間跳過的正是
  `1001421`

三者互相吻合，這組編號的內部一致性成立，但仍需上線前抽驗。

---

## 五、空檔推算

### 演算法（已確認完整）

```
輸入：日期 D、D 當日行程、D 前一日行程、FreeSlotConfig

0. 過濾：狀態 = 取消 的記錄一律排除，不列入佔用

1. 建立 busy 清單
   1a. 當日每筆行程：
       若 全天 = 是 → push {s: 0, e: 1440}，跳過以下
       s = 開始時間分鐘數
       e = 結束時間分鐘數
       若 e <= s（跨日）→ e = 1440
       push {s, e}
   1b. 前一日跨日行程的延續段：
       前一日某筆若 e <= s → push {s: 0, e: 該筆結束分鐘數}

2. 套用緩衝
   每筆 → {s: s - bufferBefore, e: e + bufferAfter}

3. 依 s 排序，合併重疊區間

4. 以 [dayStart, dayEnd] 為視窗，取 busy 的補集，得到 gaps

5. 對齊（一律往內縮）
   start = ceil(start / roundTo) * roundTo
   end   = floor(end / roundTo) * roundTo

6. 過濾
   保留 (end - start) >= minSlot 的區段
```

**第 5 步一定要往內縮**（開始無條件進位、結束無條件捨去），不可四捨五入。往外擴會把實際
被佔用的時間公布出去。

### 單元測試案例（原始六行摘要，具體案例見補述）

- 一般日：駿斯早班 `05:30-14:30` → 空檔應為 `15:30-23:00`
- 跨日：夜班 `22:00-06:00` 排在 D 日，D+1 日早上應被佔用至 `07:00`（含班後緩衝）
- 緩衝後重疊：迪卡儂早早 `09:30-13:30` + 拍攝賽事 `14:00-22:00`，緩衝後應合併成一段
- 全天行程 → 當日回傳空陣列
- 碎片小於 `minSlot` → 被濾掉
- 狀態＝取消的記錄不造成佔用

---

## 已知地雷

### Express `router.use()` 不指定路徑會攔截所有路徑

`router.use((req, res, next) => ...)`（第一個參數是 middleware function，不是路徑字串）
會比對「所有」路徑，不只是同一個路由檔案裡後面的 route，連掛在它後面、完全不相關的其他
路由檔案也會一起被攔到——因為 `routes/index.ts` 是用 `router.use(xxxRouter)`（沒有路徑
前綴）把每個路由檔案掛進同一個 `/api` router，執行順序上大家共用同一條 middleware chain。

實際踩過的例子：合約模組鎖定用的中介層，一開始寫成

```ts
router.use((req, res, next) => {
  if (BUSINESS_MODULE_LOCKS.contracts) { res.status(423).json(...); return; }
  next();
});
```

鎖定時這段會擋住「所有」路徑，包含掛在 `contractsRouter` 之後、跟合約模組完全無關的
新版行事曆 `/roster/*` 路由——症狀是合約模組一鎖定，行事曆整組 API 全部回 423。

**修法：一定要給 `router.use()` 加上自己的路徑前綴**，讓它只比對自己這個模組底下的路徑：

```ts
router.use("/contracts", (req, res, next) => {
  if (BUSINESS_MODULE_LOCKS.contracts) { res.status(423).json(...); return; }
  next();
});
```

`contracts.ts`、`projects.ts`、`contractSign.ts`、`quoteSign.ts` 這四支都有同一種模組鎖定
中介層，已全數修正為帶路徑前綴的寫法（`/contracts`、`/projects`、`/contract-sign`、
`/quote-sign`）。之後新增任何「整支路由檔案共用的中介層」，一律要先確認掛進
`routes/index.ts` 的方式有沒有路徑前綴，沒有的話 `router.use()` 一定要自己補上。

---

## 九、驗收標準（12 項）

**不接受只做程式碼審查、`tsc` 編譯通過或邏輯推論就回報完成。必須實際在瀏覽器操作並提供
證據。**

| # | 項目 | 需附證據 |
|---|---|---|
| 1 | 班別模板列表正確讀到 6 筆，依排序排列 | 畫面截圖 |
| 2 | 新增一個模板，Ragic 記錄欄位確實有值 | Ragic 記錄截圖 |
| 3 | 單日套用模板，來源模板／班別顏色／類型／狀態四欄皆有值 | Network POST payload + Ragic 記錄截圖 |
| 4 | 重複排班建立 10 筆以上，排班群組欄位全數一致 | Ragic 依群組篩選的列表截圖 |
| 5 | 刪除整組，該群組筆數歸零 | 刪除前後截圖 |
| 6 | 跨日夜班排入後，隔日早上空檔確實被扣除 | 週視圖 + 空檔清單截圖 |
| 7 | 狀態改為「取消」後，該時段變回空檔 | 修改前後截圖 |
| 8 | 調整緩衝與最短空檔，空檔即時變化 | 兩組設定的截圖對照 |
| 9 | 空檔設定 PATCH 回 Ragic 成功，且**仍只有一筆記錄** | Ragic 列表截圖 |
| 10 | LINE 新增行程，寫入的是 `/ragicforms21/8` 不是舊表 | Network payload + Ragic 記錄截圖 |
| 11 | 待辦功能不受影響，仍能正常讀寫 | 操作截圖 |
| 12 | 空檔推算單元測試全數通過 | 測試輸出 |

**特別注意第 3、9、10 項** — 這三項最容易出現「API 回成功但欄位空白」或「寫錯表」，一定
要回 Ragic 介面用眼睛確認。

---

## 範圍確認（本輪對話中已與使用者確認）

- 驗收標準以本檔案第九節 12 項為準。
- 資料夾層 base URL 採方案 A：Secret `RAGIC_FOLDER_BASE =
  https://ap15.ragic.com/qsprint/ragicforms21`，不從 `RAGIC_BASE_URL` 推導、不 fallback。
- 新的「積檔推算」空檔系統與既有 `book.html` / `share.html` 預約流程**完全分開**：不寫回
  `/ragicforms21/1` 的「類型＝空檔」記錄，不修改 `book.html`、`share.html`、預約相關 API。
  本功能的對外輸出僅限於：(a) 新的管理介面顯示，(b) 依 03 文件第二節第 7 項產生文字並經
  LINE 推播公布。
