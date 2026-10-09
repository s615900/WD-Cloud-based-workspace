import { saveSubscription } from "@/server/lib/pushRagic";
import { pushNotConfiguredResponse } from "@/server/lib/pushGuard";
import { errorMessage, json, readBody } from "@/server/http";

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  deviceName?: unknown;
}

export async function POST(req: Request) {
  const blocked = pushNotConfiguredResponse();
  if (blocked) return blocked;

  const body = await readBody<Body>(req);
  const { endpoint } = body;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof p256dh !== "string" || typeof auth !== "string") {
    return json({ error: "訂閱資料格式不正確" }, 400);
  }
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.slice(0, 60) : "";

  try {
    await saveSubscription({ deviceName, endpoint, p256dh, auth });
    return json({ success: true });
  } catch (err) {
    console.error("儲存推播訂閱失敗:", err);
    return json({ error: errorMessage(err, "儲存失敗") }, 500);
  }
}
