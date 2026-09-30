// LINE Webhook：需要原始 body 做 HMAC 簽章驗證，所以先讀 text 再自己 JSON.parse。
import { validateSignature, type WebhookEvent } from "@line/bot-sdk";
import { handleEvent } from "@/server/bot/webhook";

export async function POST(req: Request) {
  const secret = process.env["LINE_CHANNEL_SECRET"];
  if (!secret) {
    console.error("webhook error: LINE_CHANNEL_SECRET is not set");
    return new Response(null, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  if (!signature || !validateSignature(rawBody, secret, signature)) {
    return new Response("signature validation failed", { status: 401 });
  }

  try {
    const { events } = JSON.parse(rawBody) as { events: WebhookEvent[] };
    await Promise.all(events.map((e) => handleEvent(e)));
    return new Response("OK");
  } catch (err) {
    console.error("webhook error:", err);
    return new Response(null, { status: 500 });
  }
}
