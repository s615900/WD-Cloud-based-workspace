// 給管理者本人登入用，只允許 ALLOWED_LINE_USER_ID 這一個 LINE User ID 通過。
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthBypassed } from "@/server/session";
import { STATE_COOKIE, STATE_MAX_AGE_SEC, getEnv, getRedirectUri, publicUrl, secureCookie } from "@/server/lineLogin";

export async function GET(request: Request) {
  // 開發模式略過 LINE 登入時，直接回首頁
  if (isAuthBypassed()) return NextResponse.redirect(publicUrl("/desktop", request));

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getEnv("LINE_LOGIN_CHANNEL_ID"),
    redirect_uri: getRedirectUri(request),
    state,
    scope: "openid profile",
  });

  const res = NextResponse.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`);
  // 沒有簽章，因為這個 cookie 不是授權依據，只是拿來跟 callback 帶回的 state
  // 做「同一個瀏覽器」的一致性比對（防 CSRF）。
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: STATE_MAX_AGE_SEC,
    path: "/",
  });
  return res;
}
