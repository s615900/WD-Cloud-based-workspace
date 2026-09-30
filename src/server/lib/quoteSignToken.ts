// 報價單客戶簽署頁的公開連結權杖：用 HMAC 簽章報價單的 Ragic 紀錄編號，讓連結本身
// 就是憑證，不用另外開資料表存 token → quoteId 的對照，也不會被人用連續數字亂猜到
// 別人的報價單（沒有正確簽章一律當作無效連結）。鑰匙沿用 SESSION_SECRET（app.ts 開機
// 時已經檢查過一定有設），不用再多一個環境變數。
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const val = process.env["SESSION_SECRET"];
  if (!val) throw new Error("SESSION_SECRET is not set");
  return val;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signQuoteToken(quoteId: string): string {
  const payload = Buffer.from(quoteId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyQuoteToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const quoteId = Buffer.from(payload, "base64url").toString("utf8");
    return /^\d+$/.test(quoteId) ? quoteId : null;
  } catch {
    return null;
  }
}
