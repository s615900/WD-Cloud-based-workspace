import { dueDateConfigured, queryRecordsFromRagic, updateTaskInRagic } from "@/server/bot/ragic";
import { DATE_RE } from "@/server/modules/dates";
import { VALID_TASK_STATUSES } from "@/server/modules/tasks";
import { listAllSchedule, updateSchedule } from "@/server/ragic/schedule";
import { errorMessage, json, readBody } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const body = await readBody<{ status?: unknown; source?: unknown; dueDate?: unknown; content?: unknown }>(req);

  // 桌面版待辦頁把 /ragicforms21/1（待辦）跟 /ragicforms21/8（排班行程）兩張表的紀錄混在
  // 同一個清單顯示，紀錄編號互不相干、會撞號。呼叫端一定要明確帶 source，
  // 才知道要寫哪一張表，避免把行程的紀錄誤寫進撞號的待辦那筆。
  if (body.source !== "todo" && body.source !== "schedule") {
    return json({ success: false, error: "source 必須是 todo 或 schedule" }, 400);
  }

  // 狀態、到期日、內容至少要改一個
  if (body.status === undefined && body.dueDate === undefined && body.content === undefined) {
    return json({ success: false, error: "請提供 status、dueDate 或 content" }, 400);
  }
  if (body.content !== undefined && (typeof body.content !== "string" || !body.content.trim())) {
    return json({ success: false, error: "content 不可為空" }, 400);
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

  // 行程（/8）：只能改狀態（完成／準備中），其他欄位請到行事曆改
  if (body.source === "schedule") {
    if (body.status === undefined || body.dueDate !== undefined || body.content !== undefined) {
      return json({ success: false, error: "行程只能在這裡更改狀態，標題與時間請用行程的編輯功能" }, 400);
    }
    try {
      const entry = (await listAllSchedule()).find((e) => String(e.id) === id && e.userId === userId && e.kind === "個人行程");
      if (!entry) return json({ success: false, error: "找不到這筆行程" }, 404);
      // 已取消的行程維持取消，不被「準備中」蓋掉
      if (entry.status === "取消") return json({ success: false, error: "此行程已取消，請至行事曆恢復" }, 400);
      await updateSchedule(id, { status: body.status === "完成" ? "完成" : "預定" });
      return json({ success: true });
    } catch (err) {
      console.error("更新行程狀態失敗:", err);
      return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
    }
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
        ...(typeof body.content === "string" ? { content: body.content.trim() } : {}),
      },
      record["截止日期"]?.trim() ?? "",
    );
    return json({ success: true });
  } catch (err) {
    console.error("更新待辦狀態失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
