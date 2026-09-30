// 取代原本 Express 的 requireAuth 中介層：桌面版頁面（/desktop/*）與需要登入的 API 前綴
// 一律檢查 session cookie。/api/share、/api/book、/api/quote-sign、/api/contract-sign、
// /api/healthz、/api/cron、/webhook 不在 matcher 裡，天生就不受影響。
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthorizedUser } from "@/server/session";

export function proxy(request: NextRequest) {
  const user = getAuthorizedUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: [
    "/desktop/:path*",
    "/api/tasks/:path*",
    "/api/calendar/:path*",
    "/api/schedule/:path*",
    "/api/desktop-settings/:path*",
    "/api/clients/:path*",
    "/api/products/:path*",
    "/api/quotes/:path*",
    "/api/contracts/:path*",
    "/api/projects/:path*",
    "/api/roster/:path*",
  ],
};
