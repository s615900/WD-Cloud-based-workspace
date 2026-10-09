// 設定頁「傳送測試通知」：發給所有已訂閱的裝置
import { sendPushToAll } from "@/server/lib/webPush";
import { pushNotConfiguredResponse } from "@/server/lib/pushGuard";
import { errorMessage, json } from "@/server/http";

export async function POST() {
  const blocked = pushNotConfiguredResponse();
  if (blocked) return blocked;

  try {
    const result = await sendPushToAll({
      title: "生活記事",
      body: "推播通知測試成功 ✅",
      url: "/desktop/tasks",
      tag: "push-test",
    });
    if (result.sent === 0) {
      return json({ error: "沒有可以發送的裝置，請先在這支手機開啟通知", ...result }, 404);
    }
    return json({ success: true, ...result });
  } catch (err) {
    console.error("測試推播失敗:", err);
    return json({ error: errorMessage(err, "發送失敗") }, 500);
  }
}
