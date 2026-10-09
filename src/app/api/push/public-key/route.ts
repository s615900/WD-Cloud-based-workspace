// 前端訂閱推播要用的 VAPID 公鑰（公鑰本來就是公開的）。用 API 提供而不是 NEXT_PUBLIC_ 變數，
// 這樣換金鑰不用重新 build。
import { pushNotConfiguredResponse } from "@/server/lib/pushGuard";
import { json } from "@/server/http";

export function GET() {
  const blocked = pushNotConfiguredResponse();
  if (blocked) return blocked;
  return json({ publicKey: process.env["VAPID_PUBLIC_KEY"] });
}
