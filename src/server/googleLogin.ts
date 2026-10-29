// Google 登入（跟 googleapis 日曆同步用的服務帳號是不同的東西）共用設定。
import { publicUrl } from "./publicUrl";

export const GOOGLE_STATE_COOKIE = "google_login_state";

// 注意：這個網址必須跟 Google Cloud Console「已授權的重新導向 URI」完全一致。
export function getGoogleRedirectUri(request: Request): string {
  return process.env["GOOGLE_LOGIN_REDIRECT_URI"] || publicUrl("/auth/google/callback", request).toString();
}

// ALLOWED_GOOGLE_EMAILS：允許登入的 Gmail，多個用逗號分隔，不分大小寫。沒設＝沒有人能用 Google 登入。
export function isAllowedGoogleEmail(email: string): boolean {
  const allowed = (process.env["ALLOWED_GOOGLE_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
