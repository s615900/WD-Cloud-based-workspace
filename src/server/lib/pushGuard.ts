// /api/push/* 共用：尚未設定 VAPID 金鑰或 Ragic 訂閱表時直接擋下，回 503
import { pushConfigured, vapidConfigured } from "./pushRagic";
import { json } from "../http";

export function pushNotConfiguredResponse() {
  if (!vapidConfigured()) {
    return json({ success: false, error: "尚未設定 VAPID 金鑰（見 docs/09）", notConfigured: true }, 503);
  }
  if (!pushConfigured()) {
    return json({ success: false, error: "尚未設定 Ragic 推播訂閱表（見 docs/09）", notConfigured: true }, 503);
  }
  return null;
}
