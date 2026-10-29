// Google 登入第一步：導去 Google 授權頁。只有 ALLOWED_GOOGLE_EMAILS 裡的信箱最後能通過。
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthBypassed } from "@/server/session";
import { publicUrl } from "@/server/publicUrl";
import { STATE_MAX_AGE_SEC, getEnv, secureCookie } from "@/server/lineLogin";
import { GOOGLE_STATE_COOKIE, getGoogleRedirectUri } from "@/server/googleLogin";

export async function GET(request: Request) {
  if (isAuthBypassed()) return NextResponse.redirect(publicUrl("/desktop", request));

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getEnv("GOOGLE_LOGIN_CLIENT_ID"),
    redirect_uri: getGoogleRedirectUri(request),
    scope: "openid email",
    state,
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: STATE_MAX_AGE_SEC,
    path: "/",
  });
  return res;
}
