import { json } from "@/server/http";
import { badRecordId, handle } from "@/server/finance/route";
import { confirmTransaction } from "@/server/finance/service";

export async function POST(_req: Request, ctx: RouteContext<"/api/finance/transactions/[recordId]/confirm">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("確認明細", async () => {
    await confirmTransaction(recordId);
    return json({ success: true });
  });
}
