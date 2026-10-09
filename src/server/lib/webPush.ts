// Web Push 發送：用 web-push 套件、VAPID 金鑰從環境變數讀（VAPID_PUBLIC_KEY／VAPID_PRIVATE_KEY／VAPID_SUBJECT）。
// 訂閱失效（HTTP 404／410）時自動從 Ragic 刪掉那一台裝置。
import webpush from "web-push";
import { deleteSubscriptionById, listSubscriptions, type PushSubscriptionRecord } from "./pushRagic";

export interface PushPayload {
  title: string;
  body: string;
  // 點擊通知後要開的站內路徑，例如 /desktop/tasks?id=123
  url: string;
  // 相同 tag 的通知會互相取代，避免同一件事重複堆疊
  tag?: string;
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const subject = process.env["VAPID_SUBJECT"];
  const pub = process.env["VAPID_PUBLIC_KEY"];
  const priv = process.env["VAPID_PRIVATE_KEY"];
  if (!subject || !pub || !priv) throw new Error("VAPID_SUBJECT／VAPID_PUBLIC_KEY／VAPID_PRIVATE_KEY 未設定");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
}

async function sendOne(sub: PushSubscriptionRecord, payload: PushPayload): Promise<"sent" | "removed" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await deleteSubscriptionById(sub.id).catch(() => undefined);
      return "removed";
    }
    console.error("推播發送失敗:", status, err instanceof Error ? err.message : err);
    return "failed";
  }
}

// 發給所有已訂閱的裝置
export async function sendPushToAll(payload: PushPayload): Promise<SendResult> {
  ensureConfigured();
  const subs = await listSubscriptions();
  const results = await Promise.all(subs.map((s) => sendOne(s, payload)));
  return {
    sent: results.filter((r) => r === "sent").length,
    removed: results.filter((r) => r === "removed").length,
    failed: results.filter((r) => r === "failed").length,
  };
}
