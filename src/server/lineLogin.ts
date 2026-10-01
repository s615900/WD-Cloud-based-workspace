// LINE Login（跟 LINE Bot Messaging API 是不同的東西）共用設定。
export const STATE_COOKIE = "line_login_state";
export const STATE_MAX_AGE_SEC = 10 * 60; // 10 分鐘，OAuth 往返夠用，不用留太久

export function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

import { publicUrl } from "./publicUrl";

// 優先用環境變數 LINE_LOGIN_REDIRECT_URI；沒設就用網站對外網域組出來（見 publicUrl）。
// 注意：這個網址必須跟 LINE Developers 後台登記的 Callback URL 完全一致。
export function getRedirectUri(request: Request): string {
  return process.env["LINE_LOGIN_REDIRECT_URI"] || publicUrl("/auth/callback", request).toString();
}

export const secureCookie = process.env.NODE_ENV === "production";
