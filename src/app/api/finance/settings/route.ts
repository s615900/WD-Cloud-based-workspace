import { json, readBody } from "@/server/http";
import { getSettings, saveSettings } from "@/server/finance/entities";
import { handle } from "@/server/finance/route";

export function GET() {
  return handle("讀取財務設定", async () => json(await getSettings()));
}

export function PATCH(req: Request) {
  return handle("儲存財務設定", async () => {
    const b = await readBody<{ remindOn?: unknown; remindTime?: unknown; defaultRemindDays?: unknown }>(req);
    await saveSettings({
      ...(b.remindOn !== undefined ? { remindOn: Boolean(b.remindOn) } : {}),
      ...(b.remindTime !== undefined ? { remindTime: String(b.remindTime) } : {}),
      ...(b.defaultRemindDays !== undefined ? { defaultRemindDays: Number(b.defaultRemindDays) } : {}),
    });
    return json({ success: true });
  });
}
