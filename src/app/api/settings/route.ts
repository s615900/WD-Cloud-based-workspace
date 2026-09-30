// 舊版手機 PWA 設定頁用的唯讀資訊 API：目前使用者、各項外部服務連線狀態、版本資訊。
// 手機版頁面已歸檔，這支保留下來維持 API 相容。
import { execFileSync } from "node:child_process";

// 部署環境不一定帶著 .git 資料夾，抓不到就退回固定字串，不讓這支 API 整支噴錯。
function readVersion(): string {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h %cd", "--date=short"], {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
  } catch {
    return "版本資訊暫不可用";
  }
}

const VERSION = readVersion();

// 只檢查對應的環境變數是不是存在，不會每次都真的打一次 API 測試連線。
function hasEnv(...keys: string[]): boolean {
  return keys.every((key) => !!process.env[key]);
}

export function GET() {
  return Response.json({
    user: "WD",
    connections: [
      {
        key: "ragic",
        label: "Ragic API",
        status: hasEnv("RAGIC_BASE_URL", "RAGIC_API_KEY") ? "connected" : "not_configured",
      },
      {
        key: "googleCalendar",
        label: "Google Calendar",
        status: hasEnv("GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_CALENDAR_ID") ? "connected" : "not_configured",
      },
      {
        key: "lineWebhook",
        label: "LINE Bot Webhook",
        status: hasEnv("LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN") ? "connected" : "not_configured",
      },
    ],
    version: VERSION,
  });
}
