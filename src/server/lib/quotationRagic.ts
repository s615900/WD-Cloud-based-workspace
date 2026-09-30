// 桌面版接案商業模組共用的 Ragic 客戶端：串接另一個 Ragic base（QUOTATION_RAGIC_BASE_URL），
// 跟 bot/ragic.ts（手機版任務表）是完全不同的 workbook，但共用同一組 RAGIC_API_KEY。
// 這個檔案只給 routes/clients.ts、products.ts、quotes.ts、contracts.ts、projects.ts 使用，
// 不會被手機版任何程式碼 import，不影響手機版行為。
//
// 認證與查詢慣例沿用 bot/ragic.ts：API Key 放在網址的 ?APIKey= 查詢字串、網址加 ?api 參數
// 才回傳 JSON。寫入用 application/x-www-form-urlencoded + URLSearchParams，欄位用 Ragic
// 內部欄位編號（不是欄位名稱）。
//
// 子表格寫入格式（Ragic API 官方文件 Create/Update Parameters）：同一列的欄位共用同一個
// 負數列號，例如 "1000156_-1"、"1000159_-1" 是第一列，"1000156_-2" 是第二列 —— 負數本身
// 沒有意義，只是用來標記「這幾個欄位是同一列」。編輯既有子表格列則用該列真實的正數列號
// （例如 "1000156_12"），刪除列用 "DELSUB_<子表格欄位編號>=<列號>"。

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

function quotationBase(): string {
  return getEnv("QUOTATION_RAGIC_BASE_URL");
}

function apiKey(): string {
  return getEnv("RAGIC_API_KEY");
}

// 各表單在 workbook 裡的路徑（不含 base），對照使用者提供的 Ragic 表單網址。
// 產品及服務（data-management）是跟 quotation-system 平行的獨立分頁，
// 路徑不能加 "quotation-system/" 前綴，否則會打到帳號導覽結構而不是這張表的資料。
export const SHEET = {
  clients: "quotation-system/1",
  products: "data-management/1",
  quotes: "quotation-system/7",
  contracts: "quotation-system/12",
  projects: "quotation-system/13",
} as const;

// Ragic 查詢（GET）回傳的 JSON 是用「欄位名稱」當 key，跟新增／更新（POST）要用的
// 「欄位內部編號」是兩套不同的 key（實測 quotation-system/1、/7、/13 皆如此，
// 沿用 bot/ragic.ts 讀取端一貫用欄位名稱的慣例）。下面每個 *_READ_FIELD 對應同一張表，
// 只給讀取用；寫入仍然用上面／下面對應的 *_FIELD（數字編號）。

function buildUrl(sheetPath: string, recordId?: number | string, extraQuery?: string): string {
  const idSegment = recordId !== undefined ? `/${recordId}` : "";
  const q = extraQuery ? `&${extraQuery}` : "";
  return `${quotationBase()}/${sheetPath}${idSegment}?api&APIKey=${encodeURIComponent(apiKey())}${q}`;
}

export type RagicRecordData = Record<string, unknown>;

// Ragic 子表格在 GET 回應裡實測是「用該列紀錄編號當 key」的物件（跟主表清單、單筆查詢
// 是同一種包法），不是陣列——即使只有一列也一樣。這裡統一攤平成陣列，讀取／比對列號的
// 呼叫端都不用各自處理這個格式（之前用 Array.isArray 判斷永遠是 false，導致讀不到品項、
// 編輯時也刪不掉舊列）。
export function unwrapSubtableRows(rows: unknown): RagicRecordData[] {
  if (Array.isArray(rows)) return rows as RagicRecordData[];
  if (rows && typeof rows === "object") return Object.values(rows as Record<string, RagicRecordData>);
  return [];
}

// 查詢整張表（GET，無 recordId）：回傳物件，key 是 Ragic 內部紀錄編號（字串數字），
// value 是該筆紀錄的欄位資料。extraQuery 可帶 where=、subtables=0 等額外查詢參數。
export async function ragicList(
  sheetPath: string,
  extraQuery?: string,
): Promise<Record<string, RagicRecordData>> {
  const res = await fetch(buildUrl(sheetPath, undefined, extraQuery));
  if (!res.ok) {
    throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, RagicRecordData>>;
}

// 查詢單筆紀錄（GET，含 recordId）：預設會帶出子表格資料。
// 注意：Ragic 就算網址已經指定 recordId，回應本身仍然包成「用紀錄編號當 key」的物件
// （例如 {"110": {...實際欄位...}}），跟 ragicList 是同一種包法，不會因為只查一筆就攤平。
// 查無紀錄時回應是空物件 {}，不會有這層包裝。之前這裡直接把整包回應當成扁平的欄位物件
// 回傳，導致呼叫端（quotes.ts 的 GET /quotes/:id）永遠讀到 undefined、每個欄位都是空字串。
export async function ragicGetOne(
  sheetPath: string,
  recordId: number | string,
): Promise<RagicRecordData> {
  const res = await fetch(buildUrl(sheetPath, recordId));
  if (!res.ok) {
    throw new Error(`Ragic 查詢失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, RagicRecordData>;
  return data[String(recordId)] ?? Object.values(data)[0] ?? {};
}

interface RagicCreateResponse {
  ragicId?: number;
  [key: string]: unknown;
}

// 新增一筆紀錄，回傳 Ragic 配發的紀錄編號（_ragicId／ragicId）
export async function ragicCreate(
  sheetPath: string,
  fields: Record<string, string>,
): Promise<number> {
  const res = await fetch(buildUrl(sheetPath), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) {
    throw new Error(`Ragic 新增失敗: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as RagicCreateResponse;
  if (typeof data.ragicId !== "number") {
    throw new Error(`Ragic 新增成功但回應缺少 ragicId，無法確認新紀錄編號: ${JSON.stringify(data)}`);
  }
  return data.ragicId;
}

// 更新一筆既有紀錄的部分欄位
export async function ragicUpdate(
  sheetPath: string,
  recordId: number | string,
  fields: Record<string, string>,
): Promise<void> {
  const res = await fetch(buildUrl(sheetPath, recordId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  if (!res.ok) {
    throw new Error(`Ragic 更新失敗: ${res.status} ${await res.text()}`);
  }
  // Ragic 欄位驗證失敗時仍回 HTTP 200，要看回應裡的 status 才知道有沒有真的寫進去
  const data = (await res.json().catch(() => null)) as { status?: string; msg?: string } | null;
  if (data?.status === "ERROR") {
    throw new Error(`Ragic 更新失敗: ${data.msg ?? "未知錯誤"}`);
  }
}

export async function ragicDelete(sheetPath: string, recordId: number | string): Promise<void> {
  const res = await fetch(buildUrl(sheetPath, recordId), { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Ragic 刪除失敗: ${res.status} ${await res.text()}`);
  }
}

// ────────────────────────────────────────────────────────────────
// 客戶資料 quotation-system/1（主表單Key 1000042）
// ────────────────────────────────────────────────────────────────

export const CLIENT_FIELD = {
  類型: "1000033",
  統一編號: "1000035",
  客戶名稱: "1000034",
  聯絡人: "1000036",
  聯絡人電話: "1000053",
  公司電話: "1000038",
  聯絡地址: "1000039",
  Email: "1000037",
  分機: "1000055",
  即時通訊軟體: "1000054",
  銀行帳號: "1000056",
  聯絡方式: "1000051",
  付款條件: "1000040",
  備註: "1000041",
  // 單選，選項固定「公司戶」「一般戶」，Ragic 表單端預設值是「一般戶」——這個預設只在
  // Ragic 網頁表單操作時生效，API POST 沒帶這個 key 並不會自動補上，新增時要明確送值。
  戶別: "1001319",
  負責人: "1001320",
} as const;

export const CLIENT_READ_FIELD = {
  客戶編號: "客戶編號", // Ragic 自動產生的流水號（例：C-0002），也是「從其它表單選擇」連結欄位要寫入的顯示值
  類型: "客戶類型",
  統一編號: "統一編號",
  客戶名稱: "客戶名稱",
  聯絡人: "聯絡人",
  聯絡人電話: "聯絡人電話",
  公司電話: "公司電話",
  聯絡地址: "聯絡地址",
  Email: "Email",
  分機: "分機",
  即時通訊軟體: "即時通訊軟體",
  銀行帳號: "銀行帳號",
  聯絡方式: "聯絡方式",
  付款條件: "付款條件",
  備註: "備註",
  戶別: "戶別",
  負責人: "負責人",
} as const;

// ────────────────────────────────────────────────────────────────
// 產品及服務 data-management/1（主表單Key 1000124，唯讀）
// ────────────────────────────────────────────────────────────────

export const PRODUCT_FIELD = {
  產品編號: "1000113",
  名稱: "1000114",
  單位: "1000662",
  出貨價: "1000120",
  分類: "1000112",
  是否有效: "1000123",
} as const;

export const PRODUCT_READ_FIELD = {
  產品編號: "產品編號",
  名稱: "名稱",
  單位: "單位",
  出貨價: "出貨價",
  分類: "分類",
  是否有效: "產品是否有效",
} as const;

// ────────────────────────────────────────────────────────────────
// 報價單 quotation-system/7（主表單Key 1000147，子表格Key 1000162）
// ────────────────────────────────────────────────────────────────

export const QUOTE_FIELD = {
  // 連結客戶資料（從其它表單選擇）：實測寫入必須是目標客戶紀錄的「客戶編號」顯示值
  // （例："C-0002"），寫客戶紀錄的 Ragic 內部紀錄編號（例："2"）Ragic 會直接判定
  // 無效連結、存成空白——這點跟子表格裡的產品連結、合約/專案連結報價單是同一套規則。
  客戶編號: "1000127",
  客戶名稱: "1000130", // 留空由 Ragic 從連結欄位自動帶入
  // Ragic 設定為不可重複；同一天同一位客戶開兩張報價單會撞名，前端在送出前要自己
  // 檢查現有報價單清單、重複時自動加 -2 / -3 後綴。
  專案名稱: "1000129",
  統一編號: "1000149",
  聯絡地址: "1000150",
  聯絡人: "1000133",
  公司電話: "1000135",
  聯絡人電話: "1000136",
  電子郵件: "1000137",
  報價日期: "1000131",
  報價有效期限: "1000138",
  課稅別: "1000140",
  // 單選，選項固定「稅內含」「稅外加」。Ragic 表單上的未稅金額/稅額/總金額公式欄位
  // 只會做稅外加的算法，不會依這個欄位切換——但這對我們無妨，因為這三個金額欄位
  // 本來就是由 calcQuoteTotals() 在後端算好明確寫入（見下方 未稅金額 註解），
  // 「計稅方式」只是拿來讓 calcQuoteTotals() 決定算法分支，不依賴 Ragic 端重算。
  計稅方式: "1001321",
  折扣率: "1000139",
  // 數字型欄位，寫入必須是小數（"0.05"）。實測寫 "5%" 這種帶百分比符號的字串，
  // Ragic API 會回傳 "Invalid numeric value format." 錯誤且該欄位存成空白。
  稅率: "1000142",
  特別說明: "1000146",
  // 以下三個欄位在 Ragic 表單上看起來像是公式欄位，但實測透過 API 寫入子表格品項／
  // 主表單欄位後，Ragic 並不會自動重算這三欄（無論是否等待、無論是否跟品項同一次
  // 請求送出，都不會自動填入）——必須由我們自己依「品項小計、折扣率、稅率、計稅方式」
  // 算好再明確寫入這三個 key，否則 Ragic 端永遠顯示空白／稅額 0。
  未稅金額: "1000141",
  稅額: "1000143",
  總金額含稅: "1000145",
  付款狀態: "1001327", // 單選：未付款/已付訂金/部分付款/已付款/已取消
  已收金額: "1001326",
  // 日期時間欄位，Ragic 這兩欄格式要求是 yyyy/MM/dd hh:mm a（12 小時制 + 上午/下午
  // 的英文縮寫 AM/PM），跟其他既有日期欄位的 yyyy/MM/dd 不是同一種格式，寫入前要用
  // toQuoteDateTime() 轉換，不能直接沿用 toRagicDate()。
  已讀時間: "1001325",
  簽署人: "1001323",
  簽署時間: "1001324",
  合約條款內容: "1001322",
  // 原本是「簽名」非資料欄位（簽核流程用，無法 API 寫入），已改型態成「多圖片上傳」，
  // 現在可以寫入，但必須用 multipart/form-data 上傳檔案，不能跟其他欄位一樣用
  // application/x-www-form-urlencoded 的字串——所以不透過 ragicCreate/ragicUpdate，
  // 另外用 uploadQuoteSignature() 處理。這部分沒有實測過，第一次用要用瀏覽器核對。
  簽名檔: "1001300",
} as const;

export const QUOTE_TAX_MODES = ["稅內含", "稅外加"] as const;
export const QUOTE_PAYMENT_STATUSES = ["未付款", "已付訂金", "部分付款", "已付款", "已取消"] as const;

export const QUOTE_READ_FIELD = {
  報價單編號: "報價單編號", // Ragic 自動產生的流水號（例：Q-20260807-09），前端只顯示不寫入
  // Ragic 在報價單建立時「另外」自動配的一組流水號（例：P-20260808-09），跟報價單編號
  // 是不同的兩組序號。實測這筆才是專案表 PROJECT_FIELD.專案編號 連結欄位要寫入的值，
  // 寫報價單編號（Q-xxx）會被判定無效連結、存成空白。
  專案編號: "專案編號",
  客戶編號: "客戶編號",
  客戶名稱: "客戶名稱",
  專案名稱: "專案名稱",
  統一編號: "統一編號",
  聯絡地址: "聯絡地址",
  聯絡人: "聯絡人",
  公司電話: "公司電話",
  聯絡人電話: "聯絡人電話",
  電子郵件: "電子郵件",
  報價日期: "報價日期",
  報價有效期限: "報價有效期限",
  課稅別: "課稅別",
  計稅方式: "計稅方式",
  折扣率: "折扣率",
  稅率: "稅率",
  特別說明: "特別說明",
  未稅金額: "未稅金額",
  稅額: "稅額",
  總金額含稅: "總金額(含稅)",
  付款狀態: "付款狀態",
  已收金額: "已收金額",
  已讀時間: "已讀時間",
  簽署人: "簽署人",
  簽署時間: "簽署時間",
  合約條款內容: "合約條款內容",
  簽名檔: "簽名",
  // 簽核狀態(中文)＝欄位 1001305，前端顯示用這個；簽核狀態＝欄位 1001304（英文代碼，僅供除錯）。
  // 實測 quotation-system/7 GET 回應 key 就是「簽核狀態(中文)」，值為 未簽核／簽核中／簽核完成／已拒絕／空字串。
  簽核狀態中文: "簽核狀態(中文)",
} as const;

export const QUOTE_ITEM_SUBTABLE_FIELD = "1000162";

// 子表格在 GET 回應裡不是直接用 QUOTE_ITEM_SUBTABLE_FIELD 當 key，而是加了
// "_subtable_" 前綴（實測 quotation-system/7/<id> 單筆查詢結果如此）。
export const QUOTE_ITEM_SUBTABLE_READ_KEY = `_subtable_${QUOTE_ITEM_SUBTABLE_FIELD}`;

export const QUOTE_ITEM_FIELD = {
  產品編號: "1000156", // 連結產品及服務，值＝產品紀錄的「產品編號」顯示值（不是 Ragic 內部紀錄編號，理由同 QUOTE_FIELD.客戶編號）
  商品名稱: "1000157", // 選定產品後由 Ragic 自動帶入，可覆蓋
  單價: "1000158",
  單位: "1000663",
  數量: "1000159",
  // 這一列的小計，同樣不會由 Ragic 自動算（理由同 QUOTE_FIELD.未稅金額），
  // 要由我們自己算「單價 × 數量」寫入。
  小計: "1000160",
  備註: "1000161",
} as const;

export const QUOTE_ITEM_READ_FIELD = {
  產品編號: "產品編號",
  商品名稱: "商品名稱",
  單價: "單價",
  單位: "單位",
  數量: "數量",
  小計: "小計",
  備註: "備註",
} as const;

// ────────────────────────────────────────────────────────────────
// 合約 quotation-system/12（主表單Key 1000635，子表格「品項」Key 1000657）
// ────────────────────────────────────────────────────────────────

// 報價單號(1000628) 是唯讀連結欄位：Ragic 表單設計裡選定報價單後，這欄跟下面幾個
// 客戶資訊欄位都是靠 Ragic 表單端「同時載入其他欄位」自動帶入的——那是網頁表單操作的
// 行為，API 直接 POST 不會觸發，所以 routes/contracts.ts 一定要把這幾欄的值都用前端
// 抓到的報價單資料自己組進去，不能只送報價單號就期待其他欄位自動出現。
export const CONTRACT_FIELD = {
  // 實測寫入必須是目標報價單的「報價單編號」顯示值（例："Q-20260808-02"）；寫報價單
  // 的 Ragic 內部紀錄編號（例："120"）會被判定無效連結、存成空白，理由同 QUOTE_FIELD.客戶編號。
  報價單號: "1000628",
  客戶名稱: "1000631", // 唯讀，寫入報價單的客戶名稱（字串，不是客戶紀錄連結）
  統一編號: "1000637", // 唯讀，寫入報價單的統一編號
  聯絡人: "1000632", // 唯讀，寫入報價單的聯絡人
  聯絡人電話: "1000633", // 唯讀，寫入報價單的聯絡人電話
  聯絡地址: "1000638", // 唯讀，寫入報價單的聯絡地址
  Email: "1001301", // 唯讀，寫入報價單的 Email
  關聯專案: "1000639", // 唯讀，寫入報價單的專案名稱
  報價日期: "1000629",
  有效期限: "1000636",
  狀態: "1000630",
  // 直接沿用報價單當時算好的總金額（含稅），可手動調整，合約端不重算稅務。
  合約金額: "1000634",
  // 富文字（HTML），寫入/讀取都是 HTML 字串，不是純文字。
  保密條款內容NDA: "1000649",
  備註: "1001330",
  // 「多圖片上傳」，必須用 multipart/form-data 寫入（見 uploadContractFile）。
  客戶簽署: "1000650",
  客戶簽署人: "1001331",
  // 24 小時制 yyyy/MM/dd HH:mm:ss，格式細節同 QUOTE_FIELD 已讀時間／簽署時間的註解——
  // Ragic 診斷頁面顯示 hh:mm a，但實測那個格式會靜默存空白，務必用 toQuoteDateTime()。
  客戶簽署時間: "1001328",
  負責人簽署: "1000651",
  // ⚠️ 型態是 Ragic 系統使用者選單（存 email），不是自由文字欄位，寫入必須是這個
  // workbook 裡真實存在的使用者帳號 email，寫其他值 Ragic 會判定無效、存成空白。
  負責人簽署人: "1001332",
  負責人簽署時間: "1001329",
} as const;

export const CONTRACT_STATUSES = ["草稿", "已發送", "已簽約", "已結案", "作廢"] as const;

// 合約表目前沒有任何紀錄可以實測比對，欄位名稱沿用跟其他表一致的慣例（欄位標籤＝
// CONTRACT_FIELD 的 key），之後新增第一筆合約時要用瀏覽器再核對一次是否正確對應。
// 合約編號(1001299) 是唯讀自動產生欄位（Ragic 流水號），前端只顯示不寫入，這裡只給讀取用。
export const CONTRACT_READ_FIELD = {
  合約編號: "合約編號",
  報價單號: "報價單號",
  客戶名稱: "客戶名稱",
  統一編號: "統一編號",
  聯絡人: "聯絡人",
  聯絡人電話: "聯絡人電話",
  聯絡地址: "聯絡地址",
  Email: "Email",
  關聯專案: "關聯專案",
  報價日期: "報價日期",
  有效期限: "有效期限",
  狀態: "狀態",
  合約金額: "合約金額",
  // ⚠️ 這個欄位的標籤是「全形」括號（實測 2026/09/30 GET 回應 key），跟其他欄位的半形括號慣例不同。
  // 之前寫成半形，導致 NDA 寫得進去卻永遠讀成空字串。
  保密條款內容NDA: "保密條款內容（NDA）",
  備註: "備註",
  客戶簽署人: "客戶簽署人",
  客戶簽署時間: "客戶簽署時間",
  負責人簽署人: "負責人簽署人",
  負責人簽署時間: "負責人簽署時間",
  // 簽核狀態(中文)＝欄位 1001306，前端顯示用這個；簽核狀態＝欄位 1001303（英文代碼，僅供除錯）。
  // 實測 quotation-system/12 GET 回應 key 就是「簽核狀態(中文)」，值為 未簽核／簽核中／簽核完成／已拒絕／空字串。
  簽核狀態中文: "簽核狀態(中文)",
} as const;

export const CONTRACT_ITEM_SUBTABLE_FIELD = "1000657";

// 子表格在 GET 回應裡不是直接用 CONTRACT_ITEM_SUBTABLE_FIELD 當 key，而是加了
// "_subtable_" 前綴，理由同 QUOTE_ITEM_SUBTABLE_READ_KEY。
export const CONTRACT_ITEM_SUBTABLE_READ_KEY = `_subtable_${CONTRACT_ITEM_SUBTABLE_FIELD}`;

export const CONTRACT_ITEM_FIELD = {
  // 項目(1000642) 是序號欄位，前端不用管，這裡刻意不列，讓 Ragic 自己處理。
  商品名稱: "1000641", // 已改為自由輸入，沒有連結產品及服務
  單價: "1000645",
  數量: "1000643", // 前端預設 1
  單位: "1000644", // 已改為自由輸入
  // 小計欄位在 Ragic 表單上是公式（數量×單價），但沿用報價單品項小計已經實測過的教訓
  // （API 寫入子表格不會觸發 Ragic 端重算），這裡一樣由我們自己算好明確寫入。
  小計: "1000646",
} as const;

export const CONTRACT_ITEM_READ_FIELD = {
  商品名稱: "商品名稱",
  單價: "單價",
  數量: "數量",
  單位: "單位",
  小計: "小計",
} as const;

// ────────────────────────────────────────────────────────────────
// 攝影專案管理 quotation-system/13（主表單Key 1000599）
// ────────────────────────────────────────────────────────────────

// 跟合約表一樣，聯絡人／客戶名稱／公司電話／電子郵件這四個唯讀欄位靠 Ragic 表單端
// 的「同時載入其他欄位」從客戶編號自動帶入，API POST 不會觸發，routes/projects.ts
// 要自己從前端選定的客戶資料組進去，不能只送客戶編號就期待這幾欄自動出現。
export const PROJECT_FIELD = {
  // 實測透過 API 無論寫什麼值（報價單編號、專案編號、Ragic 紀錄編號、甚至隨意文字）
  // 這欄都會存成空白——研判是 Ragic 表單設計把這欄鎖成不可由 API 寫入的唯讀欄位。
  // 不要在建立/更新專案時嘗試寫這個 key，寫了也沒用，白白多一次無效欄位。
  專案名稱: "1000593",
  // 連結報價單：實測必須寫報價單自己的「專案編號」顯示值（例："P-20260808-09"，
  // QUOTE_READ_FIELD.專案編號 讀到的那個值），不是報價單編號（Q-xxx）也不是 Ragic 內部
  // 紀錄編號——這三種格式都試過，只有這組「專案編號」文字能正確連結。
  專案編號: "1000592",
  客戶編號: "1000601", // 連結客戶資料，值＝客戶的「客戶編號」顯示值（不是 Ragic 內部紀錄編號）
  聯絡人: "1000602", // 唯讀，寫入客戶資料的聯絡人
  客戶名稱: "1000595", // 唯讀，寫入客戶資料的客戶名稱
  公司電話: "1000603", // 唯讀，寫入客戶資料的公司電話
  電子郵件: "1000604", // 唯讀，寫入客戶資料的Email
  拍攝日期: "1000596",
  專案類型: "1000600",
  專案狀態: "1000594",
  雲端交付連結: "1000609", // 唯讀顯示，這輪不提供編輯
} as const;

export const PROJECT_STATUSES = [
  "洽談中",
  "籌備中",
  "拍攝中",
  "後製修圖",
  "客戶校稿",
  "已結案",
  "取消",
] as const;

export const PROJECT_TYPES = [
  "婚禮紀錄",
  "商業攝影",
  "人像寫真",
  "活動紀錄",
  "空間攝影",
  "形象照",
  "其他",
] as const;

// 聯絡人／客戶名稱／公司電話／電子郵件這四個讀取用標籤沿用跟客戶資料表（CLIENT_READ_FIELD）
// 一致的慣例；專案編號／拍攝日期／專案類型是這輪新加的欄位，quotation-system/13 目前一筆
// 資料都沒有，全部都還沒有實測資料比對過，第一次寫入後要用瀏覽器核對是否正確對應。
export const PROJECT_READ_FIELD = {
  專案名稱: "專案名稱",
  專案編號: "專案編號",
  客戶編號: "客戶編號",
  聯絡人: "聯絡人",
  客戶名稱: "客戶名稱",
  公司電話: "公司電話",
  電子郵件: "Email",
  拍攝日期: "拍攝日期",
  專案類型: "專案類型",
  專案狀態: "專案狀態",
  雲端交付連結: "雲端交付連結",
} as const;

// ────────────────────────────────────────────────────────────────
// 子表格輔助函式：報價單品項的新增／整批取代
// ────────────────────────────────────────────────────────────────

export interface QuoteItemInput {
  productId: string;
  name?: string;
  price?: string;
  unit?: string;
  qty: string;
  note?: string;
}

function buildQuoteItemsBody(items: QuoteItemInput[]): Record<string, string> {
  const body: Record<string, string> = {};
  items.forEach((item, index) => {
    const rowId = -(index + 1);
    body[`${QUOTE_ITEM_FIELD.產品編號}_${rowId}`] = item.productId;
    if (item.name !== undefined) body[`${QUOTE_ITEM_FIELD.商品名稱}_${rowId}`] = item.name;
    if (item.price !== undefined) body[`${QUOTE_ITEM_FIELD.單價}_${rowId}`] = item.price;
    if (item.unit !== undefined) body[`${QUOTE_ITEM_FIELD.單位}_${rowId}`] = item.unit;
    body[`${QUOTE_ITEM_FIELD.數量}_${rowId}`] = item.qty;
    // 小計不會由 Ragic 自動算，這裡用單價×數量自己補上（缺任一值就當 0）
    const price = parseFloat(item.price ?? "0") || 0;
    const qty = parseFloat(item.qty) || 0;
    body[`${QUOTE_ITEM_FIELD.小計}_${rowId}`] = String(price * qty);
    if (item.note !== undefined) body[`${QUOTE_ITEM_FIELD.備註}_${rowId}`] = item.note;
  });
  return body;
}

// 新增報價單：主表單欄位 + 子表格品項在同一次 POST 一起送出
export async function createQuoteWithItems(
  mainFields: Record<string, string>,
  items: QuoteItemInput[],
): Promise<number> {
  const body = { ...mainFields, ...buildQuoteItemsBody(items) };
  return ragicCreate(SHEET.quotes, body);
}

// 整批取代報價單的子表格品項：先刪除既有列，再新增這次傳入的列。
// 分兩次 POST（先刪後加），比在同一次請求裡混用 DELSUB 與新增列更不容易踩到格式雷區。
export async function replaceQuoteItems(
  recordId: number | string,
  items: QuoteItemInput[],
): Promise<void> {
  const current = await ragicGetOne(SHEET.quotes, recordId);
  const existingRows = unwrapSubtableRows(current[QUOTE_ITEM_SUBTABLE_READ_KEY]);
  const existingIds: number[] = existingRows
    .map((row) => row["_ragicId"])
    .filter((id): id is number => typeof id === "number");

  if (existingIds.length > 0) {
    const delBody = new URLSearchParams();
    for (const id of existingIds) {
      delBody.append(`DELSUB_${QUOTE_ITEM_SUBTABLE_FIELD}`, String(id));
    }
    const res = await fetch(buildUrl(SHEET.quotes, recordId), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: delBody.toString(),
    });
    if (!res.ok) {
      throw new Error(`Ragic 刪除報價品項失敗: ${res.status} ${await res.text()}`);
    }
  }

  if (items.length > 0) {
    await ragicUpdate(SHEET.quotes, recordId, buildQuoteItemsBody(items));
  }
}

// ────────────────────────────────────────────────────────────────
// 合約品項子表格輔助函式：跟報價單品項（buildQuoteItemsBody 等）同一套模式，
// 差別只在合約品項是純自由輸入、沒有產品連結欄位。
// ────────────────────────────────────────────────────────────────

export interface ContractItemInput {
  name?: string;
  price?: string;
  unit?: string;
  qty: string;
}

function buildContractItemsBody(items: ContractItemInput[]): Record<string, string> {
  const body: Record<string, string> = {};
  items.forEach((item, index) => {
    const rowId = -(index + 1);
    if (item.name !== undefined) body[`${CONTRACT_ITEM_FIELD.商品名稱}_${rowId}`] = item.name;
    if (item.price !== undefined) body[`${CONTRACT_ITEM_FIELD.單價}_${rowId}`] = item.price;
    if (item.unit !== undefined) body[`${CONTRACT_ITEM_FIELD.單位}_${rowId}`] = item.unit;
    body[`${CONTRACT_ITEM_FIELD.數量}_${rowId}`] = item.qty;
    const price = parseFloat(item.price ?? "0") || 0;
    const qty = parseFloat(item.qty) || 0;
    body[`${CONTRACT_ITEM_FIELD.小計}_${rowId}`] = String(price * qty);
  });
  return body;
}

export async function createContractWithItems(
  mainFields: Record<string, string>,
  items: ContractItemInput[],
): Promise<number> {
  const body = { ...mainFields, ...buildContractItemsBody(items) };
  return ragicCreate(SHEET.contracts, body);
}

// 整批取代合約的子表格品項：先刪除既有列，再新增這次傳入的列，理由同 replaceQuoteItems。
export async function replaceContractItems(
  recordId: number | string,
  items: ContractItemInput[],
): Promise<void> {
  const current = await ragicGetOne(SHEET.contracts, recordId);
  const existingRows = unwrapSubtableRows(current[CONTRACT_ITEM_SUBTABLE_READ_KEY]);
  const existingIds: number[] = existingRows
    .map((row) => row["_ragicId"])
    .filter((id): id is number => typeof id === "number");

  if (existingIds.length > 0) {
    const delBody = new URLSearchParams();
    for (const id of existingIds) {
      delBody.append(`DELSUB_${CONTRACT_ITEM_SUBTABLE_FIELD}`, String(id));
    }
    const res = await fetch(buildUrl(SHEET.contracts, recordId), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: delBody.toString(),
    });
    if (!res.ok) {
      throw new Error(`Ragic 刪除合約品項失敗: ${res.status} ${await res.text()}`);
    }
  }

  if (items.length > 0) {
    await ragicUpdate(SHEET.contracts, recordId, buildContractItemsBody(items));
  }
}

// ────────────────────────────────────────────────────────────────
// 已讀時間／簽署時間：原本以為 Ragic 要求 yyyy/MM/dd hh:mm a（12 小時制＋AM/PM），
// 實測發現這個猜測是錯的——用這個格式 POST 會回 SUCCESS，但欄位其實悄悄存成空白
// （跟這個檔案其他地方講的「Ragic 不接受的值會靜默存空白」是同一套行為）。直接對
// quotation-system/7 這兩個欄位試過幾種格式後，確認 Ragic 實際接受、GET 讀回來也是
// 這個格式的是 24 小時制 yyyy/MM/dd HH:mm:ss（不接受 AM/PM 加在 yyyy/MM/dd 順序後面）。
// 這兩個時間戳一律由後端產生（不是使用者手動輸入），所以直接吃 Date 物件、
// 統一用台北時區格式化。
// ────────────────────────────────────────────────────────────────

export function toQuoteDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// ────────────────────────────────────────────────────────────────
// 簽名檔上傳（1001300，原本是簽核流程用的「簽名」非資料欄位，已改型態成「多圖片
// 上傳」）：跟其他欄位不同，這個欄位必須用 multipart/form-data 寫入，不能用
// ragicCreate/ragicUpdate 的 application/x-www-form-urlencoded。
//
// ⚠️ 這段沒有實測過（表單剛改型態，還沒有任何一筆簽名檔資料可以比對）。Ragic 官方
// 文件對圖片/檔案欄位的 multipart 慣例是 form field 名稱＝欄位內部編號，value＝檔案
// 本體，這裡先照這個慣例寫；第一次真的呼叫時要用瀏覽器開發者工具或 Ragic 後台核對
// 檔案有沒有正確存進這個欄位，格式不對的話要回來調整 field name 的寫法。
// ────────────────────────────────────────────────────────────────

export async function uploadQuoteSignature(
  recordId: number | string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  form.append(QUOTE_FIELD.簽名檔, new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
  const res = await fetch(buildUrl(SHEET.quotes, recordId), {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Ragic 上傳簽名檔失敗: ${res.status} ${await res.text()}`);
  }
}

// ────────────────────────────────────────────────────────────────
// 合約的客戶簽署（1000650）／負責人簽署（1000651）都是「多圖片上傳」，跟上面
// uploadQuoteSignature 同一套 multipart 慣例，這裡寫成通用版本讓兩個欄位共用，
// 呼叫端傳入要寫的是哪一個欄位 ID。
// ────────────────────────────────────────────────────────────────

export async function uploadContractFile(
  recordId: number | string,
  fieldId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  form.append(fieldId, new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
  const res = await fetch(buildUrl(SHEET.contracts, recordId), {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Ragic 上傳合約簽署檔失敗: ${res.status} ${await res.text()}`);
  }
}
