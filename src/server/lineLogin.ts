// LINE Login（跟 LINE Bot Messaging API 是不同的東西）共用設定。
export const STATE_COOKIE = "line_login_state";
export const STATE_MAX_AGE_SEC = 10 * 60; // 10 分鐘，OAuth 往返夠用，不用留太久

export function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

// Route Handler 裡的 request.url 是伺服器本機位址（例如 https://localhost:5000/...），
// 不是使用者連進來的網域，直接拿來組轉址網址會把人導到 localhost。
// 這裡改用反向代理（Replit）帶進來的 x-forwarded-host / host 標頭組出對外網址。
export function publicUrl(path: string, request: Request): URL {
  const fallback = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || fallback.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || fallback.protocol.replace(/:$/, "");
  return new URL(path, `${proto}://${host}`);
}

// 原本寫死 Replit 網址；改成環境變數 LINE_LOGIN_REDIRECT_URI，沒設就用目前請求的網域組出來。
// 注意：這個網址必須跟 LINE Developers 後台登記的 Callback URL 完全一致。
export function getRedirectUri(request: Request): string {
  return process.env["LINE_LOGIN_REDIRECT_URI"] ?? publicUrl("/auth/callback", request).toString();
}

export const secureCookie = process.env.NODE_ENV === "production";
