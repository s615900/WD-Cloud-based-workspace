// LINE Login 之後簽發的登入 session。原本用 cookie-parser 的簽章 cookie
// （HMAC-SHA256，鑰匙是 SESSION_SECRET），這裡沿用完全相同的簽章格式
// （"s:<value>.<base64 簽章>"），搬到 Next.js 之後舊 cookie 格式仍然相容。
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export interface SessionPayload {
  sub: string;
  iat: number;
}

function secret(): string {
  const val = process.env["SESSION_SECRET"];
  if (!val) throw new Error("SESSION_SECRET is not set");
  return val;
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64").replace(/=+$/, "");
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const actual = Buffer.from(signed.slice(idx + 1));
  const expected = Buffer.from(hmac(value));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return value;
}

export function createSessionCookieValue(sub: string): string {
  const payload: SessionPayload = { sub, iat: Date.now() };
  const value = JSON.stringify(payload);
  return `s:${value}.${hmac(value)}`;
}

// 除了驗證簽章，再檢查一次內容格式跟是否過期，避免舊格式／過期的 cookie 被當成有效 session。
export function readSession(raw: string | undefined): SessionPayload | null {
  if (typeof raw !== "string" || !raw.startsWith("s:")) return null;
  const value = unsign(raw.slice(2));
  if (value === null) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SessionPayload>;
    if (typeof parsed.sub !== "string" || typeof parsed.iat !== "number") return null;
    if (Date.now() - parsed.iat > SESSION_MAX_AGE_MS) return null;
    return { sub: parsed.sub, iat: parsed.iat };
  } catch {
    return null;
  }
}

// 本機開發用：AUTH_BYPASS=true 時略過 LINE 登入，直接視為已登入。
// 只在開發模式（next dev）生效，正式環境（next start）一律忽略，避免上線後被繞過。
export function isAuthBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env["AUTH_BYPASS"] === "true";
}

// 每次都重新比對 ALLOWED_LINE_USER_ID（不是只在登入當下判斷一次），
// 這樣如果之後把這個環境變數改掉，舊 session 會立刻失效，不用等 30 天到期。
export function getAuthorizedUser(raw: string | undefined): { sub: string } | null {
  if (isAuthBypassed()) return { sub: process.env["ALLOWED_LINE_USER_ID"] || "dev-bypass" };
  const session = readSession(raw);
  const allowedUserId = process.env["ALLOWED_LINE_USER_ID"];
  if (!session || !allowedUserId || session.sub !== allowedUserId) return null;
  return { sub: session.sub };
}
