// 合約客戶簽署頁的公開連結權杖：跟 quoteSignToken.ts 同一套設計（HMAC 簽章合約的
// Ragic 紀錄編號，連結本身就是憑證），這裡獨立成一支檔案只是要跟報價單的 token
// 分開，避免合約連結誤簽成報價單 ID 格式、或反過來被拿去開啟別的表單的資料。
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const val = process.env["SESSION_SECRET"];
  if (!val) throw new Error("SESSION_SECRET is not set");
  return val;
}

function sign(payload: string): string {
  // 前綴 "contract:" 混進簽章內容，讓合約 token 跟報價單 token（signQuoteToken）
  // 即使拿到同一個紀錄編號也會簽出不同的簽章，兩邊的 token 不能互相冒用。
  return createHmac("sha256", secret()).update(`contract:${payload}`).digest("base64url");
}

export function signContractToken(contractId: string): string {
  const payload = Buffer.from(contractId, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyContractToken(token: string): string | null {
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
    const contractId = Buffer.from(payload, "base64url").toString("utf8");
    return /^\d+$/.test(contractId) ? contractId : null;
  } catch {
    return null;
  }
}
