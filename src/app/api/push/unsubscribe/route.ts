import { deleteSubscriptionByEndpoint } from "@/server/lib/pushRagic";
import { pushNotConfiguredResponse } from "@/server/lib/pushGuard";
import { errorMessage, json, readBody } from "@/server/http";

export async function POST(req: Request) {
  const blocked = pushNotConfiguredResponse();
  if (blocked) return blocked;

  const { endpoint } = await readBody<{ endpoint?: unknown }>(req);
  if (typeof endpoint !== "string" || !endpoint) return json({ error: "缺少 endpoint" }, 400);

  try {
    await deleteSubscriptionByEndpoint(endpoint);
    return json({ success: true });
  } catch (err) {
    console.error("取消推播訂閱失敗:", err);
    return json({ error: errorMessage(err, "取消失敗") }, 500);
  }
}
