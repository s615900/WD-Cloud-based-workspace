// 桌面版設定頁專用的唯讀連線狀態 API。
import { cookies } from "next/headers";
import { BUSINESS_MODULE_LOCKS } from "@/server/lib/businessLock";
import { SESSION_COOKIE, getAuthorizedUser } from "@/server/session";

function hasEnv(...keys: string[]): boolean {
  return keys.every((key) => !!process.env[key]);
}

export async function GET() {
  const user = getAuthorizedUser((await cookies()).get(SESSION_COOKIE)?.value);

  const connections = [
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
    {
      key: "quotationRagic",
      label: "Quotation Ragic",
      status: hasEnv("QUOTATION_RAGIC_BASE_URL", "RAGIC_API_KEY") ? "connected" : "not_configured",
    },
  ];

  return Response.json({
    loggedIn: !!user,
    userId: user?.sub ?? null,
    connections,
    businessModuleLocks: BUSINESS_MODULE_LOCKS,
  });
}
