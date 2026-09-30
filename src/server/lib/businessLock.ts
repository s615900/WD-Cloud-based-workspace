// 接案商業四頁（客戶資料／報價單／合約／專案進度）各自獨立的暫時停用開關。
// 原本是單一全域開關 BUSINESS_MODULE_LOCKED，四頁要嘛全鎖要嘛全開；現在改成每個模組
// 各自一個常數，可以分開解鎖——例如客戶資料、報價單先解鎖給日常使用，合約還沒跑完
// 端到端測試、專案進度還沒開發完，繼續鎖著。
// 沿用原本「寫死在程式碼裡的常數」的設計理由：環境變數要在 Replit Secrets 網頁介面
// 手動加，不是能透過改程式碼觸及的地方。要調整就直接改下面對應的值、重新部署，
// 一樣可逆、一樣不用動其他程式碼。
export const BUSINESS_MODULE_LOCKS = {
  clients: false,
  quotes: false,
  contracts: false,
  projects: false,
} as const;

export type BusinessModuleKey = keyof typeof BUSINESS_MODULE_LOCKS;
