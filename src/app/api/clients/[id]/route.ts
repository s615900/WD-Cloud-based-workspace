import { ragicUpdate, SHEET } from "@/server/lib/quotationRagic";
import {
  buildClientFields,
  validateClientType,
  validateOptionalFields,
  type ClientBody,
} from "@/server/modules/clients";
import { errorMessage, json, lockedResponse, readBody } from "@/server/http";

export async function PATCH(req: Request, ctx: RouteContext<"/api/clients/[id]">) {
  const locked = lockedResponse("clients");
  if (locked) return locked;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return json({ success: false, error: "id 格式錯誤" }, 400);
  }

  const body = await readBody<ClientBody>(req);
  const error = validateClientType(body) ?? validateOptionalFields(body);
  if (error) return json({ success: false, error }, 400);

  try {
    await ragicUpdate(SHEET.clients, id, buildClientFields(body, true));
    return json({ success: true });
  } catch (err) {
    console.error("更新客戶失敗:", err);
    return json({ success: false, error: errorMessage(err, "更新失敗") }, 500);
  }
}
