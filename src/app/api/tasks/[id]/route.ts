import { dueDateConfigured, queryRecordsFromRagic, updateTaskInRagic } from "@/server/bot/ragic";
import { DATE_RE } from "@/server/modules/dates";
import { VALID_TASK_STATUSES } from "@/server/modules/tasks";
import { errorMessage, json, readBody } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const body = await readBody<{ status?: unknown; source?: unknown; dueDate?: unknown }>(req);

  // 桌面版待辦頁把 /ragicforms21/1（待辦）跟 /ragicforms21/8（排班行程）兩張表的紀錄混在
  // 同一個清單顯示，紀錄編號互不相干、會撞號。這支只會寫 /ragicforms21/1，所以呼叫端一定要
  // 明確帶 source:'todo' 才放行，避免把行程（/8）的紀錄誤寫進 /1 撞號的那筆。
  if (body.source !== "todo") {
    return json({ success: false, error: "此頁僅能編輯待辦／備忘／空檔，行程請至行事曆頁面修改" }, 400);
  }

  // 狀態與到期日至少要改一個
  if (body.status === undefined && body.dueDate === undefined) {
    return json({ success: false, error: "請提供 status 或 dueDate" }, 400);
  }
  if (body.status !== undefined && (typeof body.status !== "string" || !(VALID_TASK_STATUSES as readonly string[]).includes(body.status))) {
    return json({ success: false, error: "status 必須是 準備中 或 完成" }, 400);
  }
  // dueDate：yyyy-MM-dd 設定、空字串清除
  if (body.dueDate !== undefined) {
    if (typeof body.dueDate !== "string" || (body.dueDate !== "" && !DATE_RE.test(body.dueDate))) {
      return json({ success: false, error: "dueDate 格式須為 yyyy-MM-dd（或空字串清除）" }, 400);
    }
    if (!dueDateConfigured()) {
      return json({ success: false, error: "到期日欄位尚未設定（見 docs/09）" }, 503);
    }
  }

  const userId = process.env["LINE_USER_ID"];
  if (!userId) {
    return json({ success: false, error: "LINE_USER_ID is not set" }, 500);
  }

  try {
    // 先確認這個 id 真的是 /1 的紀錄才動手更新，找不到就當成 404。
    const records = await queryRecordsFromRagic(userId, null);
    const record = records.find((r) => String(r["_ragicId"]) === id);
    if (!record) {
      return json({ success: false, error: "找不到這筆待辦紀錄" }, 404);
    }

    await updateTaskInRagic(
      id,
      {
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(typeof body.dueDate === "string" ? { dueDate: body.dueDate } : {}),
      },
      record["截止日期"]?.trim() ?? "",
    );
    return json({ success: true });
  } catch (err) {
    console.error("更新待辦狀態失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
