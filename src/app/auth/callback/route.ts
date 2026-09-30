import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, getEnv, getRedirectUri, secureCookie } from "@/server/lineLogin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, createSessionCookieValue } from "@/server/session";

function text(body: string, status: number): NextResponse {
  const res = new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!state || !savedState || state !== savedState) {
    return text("登入驗證失敗（state 不符），請重新登入。", 403);
  }
  if (!code) {
    return text("登入失敗，缺少授權碼。", 400);
  }

  // 記錄目前跑到哪一步，萬一掉進下面的 catch，log 裡看得出來是卡在
  // 換 token、驗證 id_token、比對 ALLOWED_LINE_USER_ID，還是簽發 session 這一步。
  let step = "exchange_token";
  try {
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(request),
        client_id: getEnv("LINE_LOGIN_CHANNEL_ID"),
        client_secret: getEnv("LINE_LOGIN_CHANNEL_SECRET"),
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error(`LINE Login 換取 token 失敗 [step=${step}]:`, tokenRes.status, await tokenRes.text());
      return text("登入失敗，請稍後再試。", 502);
    }

    const tokenData = (await tokenRes.json()) as { id_token?: string };
    if (!tokenData.id_token) {
      console.error(`LINE Login 換取 token 回應缺少 id_token [step=${step}]:`, tokenRes.status);
      return text("登入失敗，請稍後再試。", 502);
    }

    // 用 LINE 官方的 verify 端點驗證 id_token 簽章／發行者／audience，同時直接拿到 sub（LINE User ID）。
    step = "verify_id_token";
    const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: tokenData.id_token,
        client_id: getEnv("LINE_LOGIN_CHANNEL_ID"),
      }).toString(),
    });

    if (!verifyRes.ok) {
      console.error(`LINE Login 驗證 id_token 失敗 [step=${step}]:`, verifyRes.status, await verifyRes.text());
      return text("登入失敗，請稍後再試。", 502);
    }

    step = "check_allowed_user";
    const verifyData = (await verifyRes.json()) as { sub?: string };
    const lineUserId = verifyData.sub;
    // 先印出 lineUserId，即使 ALLOWED_LINE_USER_ID 沒設而 throw，log 裡也留得下這個值可以直接拿去設定。
    console.log(`LINE Login verify 完成 [step=${step}]: lineUserId=${lineUserId ?? "(none)"}`);
    const allowedUserId = getEnv("ALLOWED_LINE_USER_ID");

    if (!lineUserId || lineUserId !== allowedUserId) {
      const res = NextResponse.redirect(new URL("/no-access", request.url));
      res.cookies.delete(STATE_COOKIE);
      return res;
    }

    step = "issue_session";
    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.set(SESSION_COOKIE, createSessionCookieValue(lineUserId), {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS / 1000,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error(`LINE Login callback 發生錯誤 [step=${step}]:`, err);
    return text("登入失敗，請稍後再試。", 500);
  }
}
