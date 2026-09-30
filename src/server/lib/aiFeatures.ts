// AI 輔助分類／圖片辨識開關，透過環境變數 AI_FEATURES_ENABLED 控制（預設關閉）。
// Gemini 額度用完時，不設這個環境變數（或設非 "true"）就會停用，不用改程式碼重新部署。
export const AI_FEATURES_ENABLED: boolean = process.env["AI_FEATURES_ENABLED"] === "true";
