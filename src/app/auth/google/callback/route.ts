import { NextResponse, type NextRequest } from "next/server";
import { getEnv, secureCookie } from "@/server/lineLogin";
import { GOOGLE_STATE_COOKIE, getGoogleRedirectUri, isAllowedGoogleEmail } from "@/server/googleLogin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, createSessionCookieValue } from "@/server/session";
import { publicUrl } from "@/server/publicUrl";

function text(body: string, status: number): NextResponse {
  const res = new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  res.cookies.delete(GOOGLE_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;

  if (!state || !savedState || state !== savedState) {
    return text("登入驗證失敗（state 不符），請重新登入。", 403);
  }
  if (!code) return text("登入失敗，缺少授權碼。", 400);

  let step = "exchange_token";
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getGoogleRedirectUri(request),
        client_id: getEnv("GOOGLE_LOGIN_CLIENT_ID"),
        client_secret: getEnv("GOOGLE_LOGIN_CLIENT_SECRET"),
      }).toString(),
    });
    if (!tokenRes.ok) {
      console.error(`Google Login 換取 token 失敗 [step=${step}]:`, tokenRes.status, await tokenRes.text());
      return text("登入失敗，請稍後再試。", 502);
    }
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return text("登入失敗，請稍後再試。", 502);

    // id_token 是直接由 Google token 端點（HTTPS）回傳，再用官方 tokeninfo 驗簽章／有效期，並比對 aud。
    step = "verify_id_token";
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
    if (!verifyRes.ok) {
      console.error(`Google Login 驗證 id_token 失敗 [step=${step}]:`, verifyRes.status, await verifyRes.text());
      return text("登入失敗，請稍後再試。", 502);
    }
    const info = (await verifyRes.json()) as { aud?: string; email?: string; email_verified?: string | boolean };
    const verified = info.email_verified === true || info.email_verified === "true";
    if (info.aud !== getEnv("GOOGLE_LOGIN_CLIENT_ID") || !verified || !info.email) {
      return text("登入失敗，請稍後再試。", 403);
    }

    step = "check_allowed_email";
    console.log(`Google Login verify 完成 [step=${step}]: email=${info.email}`);
    if (!isAllowedGoogleEmail(info.email)) {
      const res = NextResponse.redirect(publicUrl("/no-access", request));
      res.cookies.delete(GOOGLE_STATE_COOKIE);
      return res;
    }

    // 沿用既有 session 格式：sub 一律用管理者的 LINE User ID，這樣 LINE／Google 登入進來是同一個身分，
    // 資料擁有者、getAuthorizedUser 的比對都不用改。
    step = "issue_session";
    const res = NextResponse.redirect(publicUrl("/", request));
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    res.cookies.set(SESSION_COOKIE, createSessionCookieValue(getEnv("ALLOWED_LINE_USER_ID")), {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS / 1000,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error(`Google Login callback 發生錯誤 [step=${step}]:`, err);
    return text("登入失敗，請稍後再試。", 500);
  }
}
