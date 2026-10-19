import { json, readBody } from "@/server/http";
import { updateStatement, type StatementBody } from "@/server/finance/entities";
import { badRecordId, handleWrite } from "@/server/finance/route";

// 手填銀行帳單金額、最低應繳（對帳差額由讀取時計算，不寫回）
export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/statements/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handleWrite("修改帳單", async () => {
    await updateStatement(recordId, await readBody<StatementBody>(req));
    return json({ success: true });
  });
}
