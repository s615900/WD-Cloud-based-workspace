// Ragic REST API 串接
// 需要 Replit Secrets：RAGIC_BASE_URL、RAGIC_API_KEY
// 驗證方式是把 API Key 放在網址的 ?APIKey= 查詢字串裡（Basic Auth 對這個帳號行不通，已實測確認）。
// 網址要加上 ?api 這個參數，Ragic 才會回傳 JSON 而不是 HTML 頁面。
import type { BotRecord, RagicRecord } from "./flex";
import { listAllSchedule, createSchedule, genScheduleCode, type ScheduleEntry } from "../ragic/schedule";
import {
  listAllFreeSlots,
  createFreeSlot,
  updateFreeSlot,
  deleteFreeSlot,
  formatFreeSlotTimestamp,
} from "../ragic/freeSlot";

// 新增紀錄用的欄位編號（Ragic 內部欄位 ID，不是欄位名稱）
const FIELD_ID = {
  使用者ID: "1001270",
  類型: "1001271",
  內容文字: "1001272",
  狀態: "1001273",
  建立時間: "1001274",
  截止日期: "1001226",
  // 待辦的到期日（Ragic 日期欄位）。要先在 Ragic 待辦表（/ragicforms21/1）新增「到期日」日期欄位，
  // 再把欄位編號填在這裡；空字串＝尚未設定，所有讀寫到期日的地方都會略過或回報尚未設定。
  到期日: "1001486",
} as const;

export function dueDateConfigured(): boolean {
  return (FIELD_ID.到期日 as string) !== "";
}

// yyyy-MM-dd → Ragic 的 yyyy/MM/dd
const toSlash = (ymd: string) => ymd.replaceAll("-", "/");
// 到期日一直被隱藏規則（截止日期＝建立後 14 天）擋掉會看不到，所以截止日期取「兩者較晚的一天」
const laterDate = (a: string, b: string) => (a >= b ? a : b);

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

// Ragic的日期時間格式：yyyy/MM/dd HH:mm（24 小時制，例如 2026/07/24 18:22）
function formatRagicDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

// 這幾種類型代表「待完成事項」，存檔時狀態預設為準備中；其他類型（例如圖片）不套用。
// 「行程」已改存到 /ragicforms21/8（見 ragic/schedule.ts），不會再經過這裡。
const DEFAULT_STATUS_BY_TYPE: Record<string, string> = {
  備忘: "準備中",
};

// 待辦事項預設幾天後從前台自動隱藏（見 isRecordActive／queryRecordsFromRagic）：
// 新增任何類型的紀錄時，如果沒有另外指定「截止日期」，一律設為建立時間 + 14 天。
const DEFAULT_DEADLINE_DAYS = 14;

// 把「yyyy/MM/dd」（可以帶時分，只取日期部分）往後推 days 天，回傳「yyyy/MM/dd」。
// 用 UTC 運算單純做日曆天數加法，不牽涉時區換算（輸入輸出都只是日期，不是時間點）。
function addDaysToRagicDate(yyyyMMdd: string, days: number): string {
  const [y, m, d] = yyyyMMdd.split("/").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

// 新增一筆紀錄
export async function saveRecordToRagic(
  userId: string,
  record: BotRecord,
): Promise<unknown> {
  const base = getEnv("RAGIC_BASE_URL");
  const apiKey = getEnv("RAGIC_API_KEY");
  const url = `${base}?api&APIKey=${encodeURIComponent(apiKey)}`;

  const createdAt = formatRagicDateTime(new Date());
  const createdDatePart = createdAt.split(" ")[0] ?? createdAt;

  // POST body 要用 x-www-form-urlencoded，欄位用數字編號（Ragic 不吃 JSON body 或中文欄位名稱）
  const defaultDeadline = addDaysToRagicDate(createdDatePart, DEFAULT_DEADLINE_DAYS);
  const body = new URLSearchParams({
    [FIELD_ID.使用者ID]: userId,
    [FIELD_ID.類型]: record.type,
    [FIELD_ID.內容文字]: record.content,
    [FIELD_ID.建立時間]: createdAt,
    [FIELD_ID.截止日期]: record.dueDate && dueDateConfigured() ? laterDate(defaultDeadline, toSlash(record.dueDate)) : defaultDeadline,
  });
  if (record.dueDate && dueDateConfigured()) {
    body.set(FIELD_ID.到期日, toSlash(record.dueDate));
  }

  const defaultStatus = DEFAULT_STATUS_BY_TYPE[record.type];
  if (defaultStatus) {
    body.set(FIELD_ID.狀態, defaultStatus);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ragic 存檔失敗: ${response.status} ${errText}`);
  }

  return response.json();
}

// 前台顯示過濾：只顯示「截止日期」尚未過期的紀錄（今天 <= 截止日期）。
// 截止日期空白視為永不過期（沿用舊資料的既有顯示行為，不因為這次改動突然全部隱藏）；
// 這裡只是查詢層的顯示過濾，Ragic 資料庫裡的紀錄完全不受影響、不會被刪除。
function isRecordActive(r: RagicRecord): boolean {
  const deadline = r["截止日期"]?.trim();
  if (!deadline) return true;
  return getTodayYMD() <= deadline.replaceAll("/", "-");
}

// 依使用者ID（及可選的類型）查詢紀錄
export async function queryRecordsFromRagic(
  userId: string,
  type: string | null,
): Promise<RagicRecord[]> {
  const base = getEnv("RAGIC_BASE_URL");
  const apiKey = getEnv("RAGIC_API_KEY");

  const params = new URLSearchParams({
    APIKey: apiKey,
    where: `${FIELD_ID.使用者ID},eq,${userId}`,
  });
  const url = `${base}?api&${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ragic 查詢失敗: ${response.status}`);
  }

  // Ragic 回傳的每筆資料本身就內建 _ragicId 欄位（數字），可直接拿來當單筆更新的紀錄編號用
  const data = (await response.json()) as Record<string, RagicRecord>;
  const records = Object.values(data).filter(isRecordActive);

  // 「行程」已經整批換到 /ragicforms21/8（見 ragic/schedule.ts），「空檔」已經整批換到
  // /ragicforms21/9（見 ragic/freeSlot.ts）；舊表裡殘留的紀錄不遷移、也不讀取——這裡
  // 一律濾掉，不管呼叫端要不要篩類型，避免任何路徑意外撈到已經棄用的舊資料。
  const withoutDeprecatedTypes = records.filter(
    (r) => r["類型"] !== "行程" && r["類型"] !== "空檔",
  );

  if (type) {
    return withoutDeprecatedTypes.filter((r) => r["類型"] === type);
  }
  return withoutDeprecatedTypes;
}

// 把一筆排班行程（/ragicforms21/8）轉成跟 /ragicforms21/1 紀錄同樣形狀，讓清單卡片
// （buildListFlex／buildTaskListFlex／buildDailyReminderFlex）不用另外分兩套渲染邏輯。
// _completable 固定 false：這類紀錄沒有「標記完成」動作。
export function scheduleEntryToRagicRecord(e: ScheduleEntry): RagicRecord {
  return {
    _ragicId: e.id,
    類型: "行程",
    內容文字: e.title,
    狀態: e.status === "正常" ? "準備中" : "完成",
    建立時間: `${e.date.replaceAll("-", "/")} ${e.start}`,
    截止日期: "",
    _completable: false,
  };
}

export function scheduleEntryToTaskListItem(e: ScheduleEntry): TaskListItem {
  const [yyyy, mm, dd] = e.date.split("-");
  return {
    id: e.id,
    type: "行程",
    content: e.title,
    status: e.status === "正常" ? "準備中" : "完成",
    time: e.allDay ? "" : e.start,
    date: mm && dd ? `${mm}/${dd}` : null,
    createdAt: `${yyyy ?? ""}/${mm ?? ""}/${dd ?? ""} ${e.start || "00:00"}:00`,
    source: "schedule",
    sheetId: "/ragicforms21/8",
    recordId: e.id,
  };
}

// 查詢使用者「今日待辦」：讀 /ragicforms21/8，日期欄位直接比對今天（Asia/Taipei），
// 不再需要從自由文字解析日期。備忘沒有日期欄位，維持原本不算在今日待辦裡的行為。
export async function queryTodayRecordsFromRagic(
  userId: string,
): Promise<RagicRecord[]> {
  const todayYMD = getTodayYMD();
  const entries = await listAllSchedule();
  return entries
    .filter((e) => e.userId === userId && e.date === todayYMD)
    .map(scheduleEntryToRagicRecord);
}

// 查詢「未完成事項」：只看備忘（/ragicforms21/1，狀態＝準備中）。排班行程
// （/ragicforms21/8）不再併進來——「今日行程」已經是獨立區塊（見 routes/cron.ts 的
// getScheduleForDate），未完成事項只處理沒有時間概念、需要提醒自己記得做的隨手記事，
// 跟「排定好時間的行程」是不同性質的東西，混在一起分不清楚哪些是真的被遺忘的事。
export async function queryIncompleteRecordsFromRagic(
  userId: string,
): Promise<RagicRecord[]> {
  const memoRecords = await queryRecordsFromRagic(userId, "備忘");
  return memoRecords.filter((r) => r["狀態"] === "準備中");
}

export interface TodayTaskItem {
  id: number;
  type: string;
  content: string;
  status: string;
  time: string;
}

// 解析「行程 MM/DD HH:MM 標題」聊天指令裡的日期時間，年份用今年（Asia/Taipei）。
// 只給 webhook.ts 的「行程」關鍵字指令用，把使用者打的原始文字轉成結構化欄位寫進
// /ragicforms21/8（見 ragic/schedule.ts），寫入之後就不再對外回傳的內容做這種解析。
export function parseScheduleCommandText(
  content: string,
): { date: string; time: string; title: string } | null {
  const match = content.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2})\s*(.*)$/);
  if (!match) return null;
  const [, month, day, time, title] = match;
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric" }).format(
    new Date(),
  );
  return {
    date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    time,
    title: title || content,
  };
}

// PWA 首頁待辦用：備忘（建立時間是今天）＋排班行程（日期是今天）的聯集，
// 單一使用者，沿用 LINE_USER_ID 這支既有的環境變數。
export async function queryTodayTasksForApi(): Promise<TodayTaskItem[]> {
  const userId = getEnv("LINE_USER_ID");
  const memoRecords = await queryRecordsFromRagic(userId, "備忘");

  const todayYMDSlash = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "/");

  const results: TodayTaskItem[] = [];
  for (const r of memoRecords) {
    const [createdDate, createdTime] = r["建立時間"].split(" ");
    if (createdDate !== todayYMDSlash) continue;
    // 建立時間欄位實際存的是 HH:mm:ss，這裡只取 HH:mm 給前端顯示
    const createdHM = createdTime?.slice(0, 5) ?? "";
    results.push({
      id: r["_ragicId"],
      type: r["類型"],
      content: r["內容文字"],
      status: r["狀態"],
      time: createdHM,
    });
  }

  const todayYMD = getTodayYMD();
  const scheduleEntries = await listAllSchedule();
  for (const e of scheduleEntries) {
    if (e.userId !== userId || e.date !== todayYMD) continue;
    results.push({
      id: e.id,
      type: "行程",
      content: e.title,
      status: e.status === "正常" ? "準備中" : "完成",
      time: e.allDay ? "" : e.start,
    });
  }

  return results;
}

export interface TaskListItem {
  id: number;
  type: string;
  content: string;
  status: string;
  time: string;
  date: string | null;
  createdAt: string;
  // 桌面版待辦頁要靠這三個欄位分辨每筆記錄真正的來源表，編輯／檢視按鈕跟更新 API
  // 都要用這個判斷，不能拿「類型」反推——/ragicforms21/1 裡也有 類型=行程 的殘留紀錄
  // （見 docs/04 待辦事項編輯路由修復工單）。
  source: "todo" | "schedule";
  sheetId: "/ragicforms21/1" | "/ragicforms21/8";
  recordId: number;
  // 待辦的到期日（yyyy-MM-dd）；行程與沒設定的待辦是 null
  dueDate?: string | null;
}

// 把單筆 /ragicforms21/1 紀錄（備忘，或圖片等其他非行程非空檔的殘留類型）轉成
// 清單／查詢頁用的格式。「行程」讀 /ragicforms21/8、「空檔」讀 /ragicforms21/9，
// 都不會出現在這裡（見 queryRecordsFromRagic 的棄用類型過濾），不需要再從內容文字
// 解析日期時間。這裡的紀錄沒有日期概念，date 一律給 null，前端歸類到「未排定」。
function toTaskListItem(r: RagicRecord): TaskListItem {
  const [, createdTime] = r["建立時間"].split(" ");
  const createdHM = createdTime?.slice(0, 5) ?? "";

  return {
    id: r["_ragicId"],
    type: r["類型"],
    content: r["內容文字"],
    status: r["狀態"],
    time: createdHM,
    date: null,
    createdAt: r["建立時間"],
    source: "todo",
    dueDate: r["到期日"]?.trim() ? r["到期日"].trim().replaceAll("/", "-") : null,
    sheetId: "/ragicforms21/1",
    recordId: r["_ragicId"],
  };
}

// 把「H:mm」或「HH:mm」補成「HH:mm」——Date 的 ISO 解析對單位數的時分不寬容
// （例如 "2026-09-20T8:00:00+08:00" 會直接解析成 Invalid Date），一定要補零。
function padHM(hm: string): string {
  const [h, m] = hm.split(":");
  return `${(h ?? "0").padStart(2, "0")}:${(m ?? "0").padStart(2, "0")}`;
}

// 把 item 換算成可比較大小的時間戳記（毫秒），用來排序：有行程日期就用行程日期＋時間
// （年份沿用建立時間的年份，這個 App 是單一使用者的個人記事，同年份假設成立），
// 沒有行程日期（備忘）就用建立時間。
function taskSortTimestamp(item: TaskListItem): number {
  const [createdDatePart, createdTimePart] = item.createdAt.split(" ");
  const year = createdDatePart?.split("/")[0] ?? String(new Date().getFullYear());

  if (item.date) {
    const [month, day] = item.date.split("/");
    const hm = padHM(item.time || "00:00");
    const ts = new Date(`${year}-${month}-${day}T${hm}:00+08:00`).getTime();
    if (!Number.isNaN(ts)) return ts;
  }

  const [y, m, d] = (createdDatePart ?? "").split("/");
  const hm = padHM((createdTimePart ?? "00:00:00").slice(0, 5) || "00:00");
  const ts = new Date(`${y}-${m}-${d}T${hm}:00+08:00`).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

// 行程總覽／查詢頁共用：依類型（可省略，"行程" 現在讀 /ragicforms21/8、其餘讀
// /ragicforms21/1）、關鍵字（可省略，對標題／內容文字做包含比對）查詢，
// 依日期時間（行程用結構化的日期／開始時間，其餘用建立時間）由新到舊排序。
// 「行程」這個桶只收「個人行程」——排班的「班別」跟客戶送出經 WD 確認的「客戶預約」
// 都是工作排班，不是待辦事項，這裡刻意排除，避免待辦清單混進跟「要記得做的事」
// 無關的排班資料。
export async function queryTasksForApi(opts: {
  type?: string;
  keyword?: string;
}): Promise<TaskListItem[]> {
  const userId = getEnv("LINE_USER_ID");
  const keyword = opts.keyword?.trim().toLowerCase();

  let items: TaskListItem[] = [];

  if (opts.type === undefined || opts.type === "行程") {
    const scheduleEntries = await listAllSchedule();
    const scheduleItems = scheduleEntries
      .filter((e) => e.userId === userId && e.kind === "個人行程")
      .map(scheduleEntryToTaskListItem)
      .filter((item) => !keyword || item.content.toLowerCase().includes(keyword));
    items = items.concat(scheduleItems);
  }

  if (opts.type !== "行程") {
    const records = await queryRecordsFromRagic(userId, opts.type ?? null);
    const filtered = keyword
      ? records.filter((r) => r["內容文字"].toLowerCase().includes(keyword))
      : records;
    items = items.concat(filtered.map(toTaskListItem));
  }

  return items.sort((a, b) => taskSortTimestamp(b) - taskSortTimestamp(a));
}

// 更新單筆待辦（/ragicforms21/1）：狀態、到期日可以只改其中一個。
// dueDate："yyyy-MM-dd" 設定到期日，"" 清除；existingDeadline 是這筆目前的「截止日期」（yyyy/MM/dd），
// 設定到期日時一併把截止日期延到不早於到期日，避免待辦在到期日前就被隱藏規則擋掉。
// Ragic 更新單筆紀錄的網址規則：在原本的表單網址後面加上 /<紀錄編號>
export async function updateTaskInRagic(
  ragicId: number | string,
  changes: { status?: string; dueDate?: string },
  existingDeadline = "",
): Promise<unknown> {
  const base = getEnv("RAGIC_BASE_URL");
  const apiKey = getEnv("RAGIC_API_KEY");
  const url = `${base}/${ragicId}?api&APIKey=${encodeURIComponent(apiKey)}`;

  const body = new URLSearchParams();
  if (changes.status !== undefined) body.set(FIELD_ID.狀態, changes.status);
  if (changes.dueDate !== undefined) {
    body.set(FIELD_ID.到期日, changes.dueDate ? toSlash(changes.dueDate) : "");
    if (changes.dueDate && existingDeadline) {
      body.set(FIELD_ID.截止日期, laterDate(existingDeadline, toSlash(changes.dueDate)));
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ragic 存檔失敗: ${response.status} ${errText}`);
  }

  return response.json();
}

// 只改狀態（LINE「完成」指令等舊呼叫端用）
export function updateRecordStatusInRagic(ragicId: number | string, status: string): Promise<unknown> {
  return updateTaskInRagic(ragicId, { status });
}

// ────────────────────────────────────────────────────────────────
// 月曆／空檔功能：空檔預約存在獨立表 /ragicforms21/9（見 ragic/freeSlot.ts），
// 日期／開始時間／結束時間／預約狀態都是各自獨立的結構化欄位，不用再解析文字、
// 也不再借用 /1 表的「類型＝空檔」這種共用表塞資料的做法。
// ────────────────────────────────────────────────────────────────

export interface FreeSlotItem {
  id: number;
  start: string;
  end: string;
  // 只有分享頁（share.html）會用到這兩個欄位，開放預約頁（book.html）的清單本來就
  // 只回傳可預約的時段、也不該讓外部人看到姓名，所以維持 optional 不強制帶出。
  bookingStatus?: string;
  bookedBy?: string;
}

export interface CalendarDaySummary {
  date: string;
  dots: string[];
}

export interface CalendarDayDetail {
  schedule: TaskListItem[];
  memos: TaskListItem[];
  freeSlots: FreeSlotItem[];
}

// 把「建立時間」（yyyy/MM/dd HH:mm）取日期部分，轉成 yyyy-MM-dd
function createdAtToYMD(createdAt: string): string {
  return (createdAt.split(" ")[0] ?? "").replaceAll("/", "-");
}

// 今天的日期（Asia/Taipei，yyyy-MM-dd），給「過濾掉已過期空檔」用；也給 cron.ts 的
// 每日提醒用來查當日行程／空檔（見 routes/cron.ts），避免各自重算一份時區換算。
export function getTodayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 算出一筆 /ragicforms21/1 紀錄（備忘）在月曆上要算在哪一天（yyyy-MM-dd）：
// 一律用建立時間的日期。「行程」讀 /ragicforms21/8、「空檔」讀 /ragicforms21/9
// 的結構化「日期」欄位（見 getCalendarMonthSummary／getCalendarDay 的合併邏輯），
// 不會經過這裡。
function recordCalendarDate(r: RagicRecord): string {
  return createdAtToYMD(r["建立時間"]);
}

// 取得某個月份每一天的摘要（有哪些類型的資料），給月曆格子畫小色點用。
// 空檔（/9）跟舊資料（/1 殘留的類型＝空檔紀錄）分開處理：一律忽略 /1 裡的空檔類型，
// 只信任 /9 當唯一資料來源，避免兩邊資料不同步時重複計算或漏算。
export async function getCalendarMonthSummary(month: string): Promise<CalendarDaySummary[]> {
  const userId = getEnv("LINE_USER_ID");
  const records = await queryRecordsFromRagic(userId, null);

  const byDate = new Map<string, Set<string>>();
  for (const r of records) {
    if (r["類型"] === "空檔") continue;
    const date = recordCalendarDate(r);
    if (!date.startsWith(month)) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date)?.add(r["類型"]);
  }

  const scheduleEntries = await listAllSchedule();
  for (const e of scheduleEntries) {
    if (e.userId !== userId || !e.date.startsWith(month)) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, new Set());
    byDate.get(e.date)?.add("行程");
  }

  const freeSlotEntries = await listAllFreeSlots();
  for (const e of freeSlotEntries) {
    if (e.userId !== userId || !e.date.startsWith(month)) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, new Set());
    byDate.get(e.date)?.add("空檔");
  }

  return Array.from(byDate.entries())
    .map(([date, types]) => ({ date, dots: Array.from(types) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 取得整個月份所有已標註的空檔紀錄，依日期分組、日期由小到大排序（同一天內的時段依開始時間排序），
// 給「本月空檔總覽」用，不用像 getCalendarDay 那樣一天一天查。
export interface MonthFreeSlotGroup {
  date: string;
  slots: FreeSlotItem[];
}

export async function getFreeSlotsForMonth(month: string): Promise<MonthFreeSlotGroup[]> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();

  const byDate = new Map<string, FreeSlotItem[]>();
  for (const e of entries) {
    if (e.userId !== userId || !e.date.startsWith(month)) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)?.push({ id: e.id, start: e.start, end: e.end });
  }

  return Array.from(byDate.entries())
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// LINE Flex 卡片顯示用：目前所有類型都原樣顯示內容文字。
export function formatContentForDisplay(_type: string, content: string): string {
  return content;
}

// 取得單一天的完整資料：行程讀 /ragicforms21/8、備忘讀 /ragicforms21/1、
// 空檔讀 /ragicforms21/9（結構化 date/start/end 欄位，不用解析內容文字）。
export async function getCalendarDay(date: string): Promise<CalendarDayDetail> {
  const userId = getEnv("LINE_USER_ID");
  const records = await queryRecordsFromRagic(userId, null);
  const matching = records.filter((r) => recordCalendarDate(r) === date);

  const memos: TaskListItem[] = [];
  for (const r of matching) {
    if (r["類型"] === "備忘") memos.push(toTaskListItem(r));
  }

  const schedule: TaskListItem[] = [];
  const scheduleEntries = await listAllSchedule();
  for (const e of scheduleEntries) {
    if (e.userId !== userId || e.date !== date) continue;
    schedule.push(scheduleEntryToTaskListItem(e));
  }
  schedule.sort((a, b) => a.time.localeCompare(b.time));

  const freeSlots: FreeSlotItem[] = [];
  const freeSlotEntries = await listAllFreeSlots();
  for (const e of freeSlotEntries) {
    if (e.userId !== userId || e.date !== date) continue;
    freeSlots.push({ id: e.id, start: e.start, end: e.end });
  }
  freeSlots.sort((a, b) => a.start.localeCompare(b.start));

  return { schedule, memos, freeSlots };
}

// 分享端點用：一次查出多個日期各自的空檔清單。
export async function getFreeSlotsForDates(dates: string[]): Promise<Map<string, FreeSlotItem[]>> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const dateSet = new Set(dates);

  const result = new Map<string, FreeSlotItem[]>();
  for (const date of dates) result.set(date, []);

  for (const e of entries) {
    if (e.userId !== userId || !dateSet.has(e.date)) continue;
    result.get(e.date)?.push({ id: e.id, start: e.start, end: e.end });
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
  }
  return result;
}

// 分享端點用（固定連結、不帶 dates）：撈出「今天以後」所有已標註空檔，依日期由近到遠排序，
// 過去的日期不回傳，避免清單越積越長。
// 這是 WD 自己看的唯讀頁面，所以不論預約狀態為何都回傳（可預約／已預約都要看得到），
// 只有「已取消」直接濾掉不顯示；已預約的時段額外帶出預約人姓名給 WD 對照。
export async function getAllFutureFreeSlots(): Promise<MonthFreeSlotGroup[]> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const todayYMD = getTodayYMD();

  const byDate = new Map<string, FreeSlotItem[]>();
  for (const e of entries) {
    if (e.userId !== userId || e.bookingStatus === "已取消") continue;
    if (e.date < todayYMD) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)?.push({
      id: e.id,
      start: e.start,
      end: e.end,
      bookingStatus: e.bookingStatus,
      bookedBy: e.bookingStatus === "已預約" ? e.bookedBy?.trim() || undefined : undefined,
    });
  }

  return Array.from(byDate.entries())
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 新增一筆空檔標註。batchId 由呼叫端傳入（例如 rosterPublish.ts 的同一次公布共用
// 一組 genScheduleCode("PUB")），手動新增空檔（未傳 batchId）沿用 createFreeSlot 預設空字串。
export async function saveFreeSlotToRagic(date: string, start: string, end: string, batchId?: string): Promise<void> {
  const userId = getEnv("LINE_USER_ID");
  await createFreeSlot({ userId, date, start, end, batchId });
}

// 刪除一筆空檔標註
export async function deleteFreeSlotFromRagic(ragicId: number | string): Promise<void> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const exists = entries.some((e) => e.userId === userId && String(e.id) === String(ragicId));
  if (!exists) {
    throw new Error("找不到對應的空檔紀錄");
  }
  await deleteFreeSlot(ragicId);
}

// ────────────────────────────────────────────────────────────────
// 開放預約（book.html）：用「預約狀態」（可預約／待確認／已預約／已取消）欄位判斷一筆
// 空檔目前處於哪個階段，姓名、預約時間戳記各自存在 F_FREESLOT 的獨立欄位裡。
//
// 客戶送出後先進「待確認」，須由 WD 在 LINE 上按「確認預約」才真的成立（見
// confirmBookingInRagic）。空檔表本身沒有「完成/未完成」的概念（那是 /1 借用待辦表
// 時代的遺留設計），這裡純粹用預約狀態本身判斷，不再需要對應任何待辦狀態欄位。
// ────────────────────────────────────────────────────────────────

// 預約時發現這個時段已經不是「可預約」（可能已經被別人搶先送出待確認、已被 WD
// 確認，或已被 WD 取消），route 層接住這個錯誤型別後回傳 409，跟其他失敗（例如找不到
// 紀錄、Ragic 連線錯誤的 500）分開處理。
export class SlotAlreadyBookedError extends Error {
  constructor() {
    super("這個時段剛被別人預約走了");
    this.name = "SlotAlreadyBookedError";
  }
}

// WD 在 LINE 點「確認預約」／「拒絕」時，該筆記錄已經不是「待確認」了（可能已經處理
// 過、或根本找不到），confirmBookingInRagic／rejectBookingInRagic 丟這兩種錯誤，
// webhook 層接住後分別回覆對應訊息，不得重複寫入 /ragicforms21/8 或重複改狀態。
export class BookingNotFoundError extends Error {
  constructor() {
    super("找不到這筆預約紀錄");
    this.name = "BookingNotFoundError";
  }
}

export class BookingAlreadyProcessedError extends Error {
  constructor() {
    super("這筆預約已處理過");
    this.name = "BookingAlreadyProcessedError";
  }
}

// book.html 用：跟 getAllFutureFreeSlots 邏輯相同（今天以後、依日期分組），
// 但只回傳「預約狀態=可預約」的空檔，且每筆都帶 id，
// 前端才能指定要預約哪一筆（POST /api/book/:id）。
// 這裡是白名單寫法（只有等於「可預約」才收），「待確認」「已預約」「已取消」都會被
// 排除，不用再另外特判「待確認」。
export async function getBookableFreeSlots(): Promise<MonthFreeSlotGroup[]> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const todayYMD = getTodayYMD();

  const byDate = new Map<string, FreeSlotItem[]>();
  for (const e of entries) {
    if (e.userId !== userId || e.bookingStatus !== "可預約") continue;
    if (e.date < todayYMD) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)?.push({ id: e.id, start: e.start, end: e.end });
  }

  return Array.from(byDate.entries())
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 公布橋接用（routes/rosterPublish.ts）：找出「預約狀態＝可預約」的既有記錄 id，
// 供呼叫端在寫入本次公布結果前先清掉，避免重複公布造成同一時段疊加。
// 刻意不含「待確認」「已預約」「已取消」——待確認是客戶剛送出、等 WD 處理的請求，
// 已預約／已取消是處理完的紀錄，都不屬於本次公布要覆蓋的範圍，公布不得把它們清掉。
// 只回傳 id，實際刪除交給既有的 deleteFreeSlotFromRagic 逐筆執行。
export async function getCancellableFreeSlotIds(): Promise<number[]> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  return entries
    .filter((e) => e.userId === userId && e.bookingStatus === "可預約")
    .map((e) => e.id);
}

// 公布橋接用（routes/rosterPublish.ts）：找出「預約狀態＝待確認 或 已預約」的既有時段，
// 以「date|start|end」組成 key 集合，供公布前比對本次推算結果、跳過已經有客戶在談的
// 時段——不然公布會把這些時段又蓋回「可預約」，等於把待確認／已預約憑空撤銷。
export async function getPendingOrConfirmedSlotKeys(): Promise<Set<string>> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  return new Set(
    entries
      .filter((e) => e.userId === userId && (e.bookingStatus === "待確認" || e.bookingStatus === "已預約"))
      .map((e) => `${e.date}|${e.start}|${e.end}`),
  );
}

const PENDING_BOOKINGS_LIMIT = 10;

export interface PendingBooking {
  ragicId: number;
  name: string;
  date: string;
  start: string;
  end: string;
}

// Rich Menu「待確認預約」格用：列出「預約狀態＝待確認」的記錄，依日期由近到遠排序，
// 上限 10 筆（見工單 W-009 §1.2）。跟 getBookableFreeSlots 一樣直接讀 listAllFreeSlots，
// 不寫入、不改狀態——確認／拒絕動作仍由既有的 confirmBookingInRagic／rejectBookingInRagic
// 處理，這裡只負責列清單。
export async function getPendingBookings(): Promise<PendingBooking[]> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  return entries
    .filter((e) => e.userId === userId && e.bookingStatus === "待確認")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, PENDING_BOOKINGS_LIMIT)
    .map((e) => ({
      ragicId: e.id,
      name: e.bookedBy?.trim() || "（未填姓名）",
      date: e.date,
      start: e.start,
      end: e.end,
    }));
}

export interface BookedSlotResult {
  date: string;
  start: string;
  end: string;
}

// 預約一筆空檔：先查出這筆紀錄目前的預約狀態，若已經不是「可預約」（代表已經有人
// 送出待確認、已被 WD 確認，或已被 WD 取消）就丟 SlotAlreadyBookedError，不執行更新。
// 確認仍可預約後，寫入姓名、預約狀態＝待確認、預約時間戳記三個欄位——要等 WD 按下
// 「確認預約」（見 confirmBookingInRagic）才真的成立、寫入行事曆。
//
// 注意：這個檢查跟寫入之間仍有極短的查詢延遲（Ragic 沒有提供條件式更新的 API），
// 兩個人「完全同時」送出同一筆理論上還是可能都通過檢查；route 層另外用同一個
// process 內的記憶體鎖擋住同一筆 id 的併發請求，把這個縫隙補起來。
export async function bookFreeSlotInRagic(
  ragicId: number | string,
  name: string,
): Promise<BookedSlotResult> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const target = entries.find((e) => e.userId === userId && String(e.id) === String(ragicId));
  if (!target) {
    throw new Error("找不到這筆空檔紀錄");
  }
  if (target.bookingStatus !== "可預約") {
    throw new SlotAlreadyBookedError();
  }

  await updateFreeSlot(ragicId, {
    bookedBy: name,
    bookingStatus: "待確認",
    bookedAt: formatFreeSlotTimestamp(new Date()),
  });

  return { date: target.date, start: target.start, end: target.end };
}

// 待確認的預約找不到，或已經不是「待確認」了（重複點擊、或已被另一次操作處理過），
// confirmBookingInRagic／rejectBookingInRagic 共用同一段檢查邏輯。
async function findPendingBooking(
  ragicId: number | string,
): Promise<{ slot: { start: string; end: string }; date: string; name: string }> {
  const userId = getEnv("LINE_USER_ID");
  const entries = await listAllFreeSlots();
  const target = entries.find((e) => e.userId === userId && String(e.id) === String(ragicId));
  if (!target) {
    throw new BookingNotFoundError();
  }
  if (target.bookingStatus !== "待確認") {
    throw new BookingAlreadyProcessedError();
  }

  return {
    slot: { start: target.start, end: target.end },
    date: target.date,
    name: target.bookedBy?.trim() || "（未填姓名）",
  };
}

export interface BookingActionResult {
  date: string;
  start: string;
  end: string;
  name: string;
}

// WD 按「確認預約」：先把空檔表該筆改成「已預約」，這步失敗就整個確認動作失敗
// （不寫 /8）。改成功後才寫入 /ragicforms21/8（複用 ragic/schedule.ts 的
// createSchedule，不另寫 Ragic HTTP 呼叫），並把同一組行程編號回填到空檔表的
// scheduleCode 欄位，讓兩張表可以互相對照；這兩步若失敗，空檔已經標記已預約、
// 客戶認知預約成立，不回滾，只記錄錯誤並讓呼叫端在回覆訊息附註提醒 WD 手動確認
// （見 calendarSynced）。
export async function confirmBookingInRagic(
  ragicId: number | string,
): Promise<BookingActionResult & { calendarSynced: boolean }> {
  const { slot, date, name } = await findPendingBooking(ragicId);

  await updateFreeSlot(ragicId, { bookingStatus: "已預約" });

  let calendarSynced = true;
  try {
    const scheduleCode = genScheduleCode("SCH");
    await createSchedule({
      userId: getEnv("LINE_USER_ID"),
      kind: "客戶預約",
      date,
      start: slot.start,
      end: slot.end,
      title: `預約 - ${name}`,
      note: `來源: /ragicforms21/9 #${ragicId}`,
      code: scheduleCode,
    });
    await updateFreeSlot(ragicId, { scheduleCode });
  } catch (err) {
    console.error("確認預約後寫入行事曆（/ragicforms21/8）失敗:", err);
    calendarSynced = false;
  }

  return { date, start: slot.start, end: slot.end, name, calendarSynced };
}

// WD 按「拒絕」：把空檔表該筆改回「可預約」、清空預約人姓名與預約時間戳記。
// 這個時段就此回到可預約清單，不寫入 /8。
export async function rejectBookingInRagic(
  ragicId: number | string,
): Promise<BookingActionResult> {
  const { slot, date, name } = await findPendingBooking(ragicId);

  await updateFreeSlot(ragicId, {
    bookingStatus: "可預約",
    bookedBy: "",
    bookedAt: "",
  });

  return { date, start: slot.start, end: slot.end, name };
}
