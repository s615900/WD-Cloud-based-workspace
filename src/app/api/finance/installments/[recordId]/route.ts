import { json, readBody } from "@/server/http";
import { updateInstallment, type InstallmentBody } from "@/server/finance/entities";
import { loadContext } from "@/server/finance/engine";
import { badRecordId, handle } from "@/server/finance/route";

export async function PATCH(req: Request, ctx: RouteContext<"/api/finance/installments/[recordId]">) {
  const { recordId } = await ctx.params;
  const bad = badRecordId(recordId);
  if (bad) return bad;
  return handle("修改分期", async () => {
    const data = await loadContext();
    await updateInstallment(recordId, await readBody<InstallmentBody>(req), (code) => data.installments.find((i) => i.code === code)?.posted ?? 0);
    return json({ success: true });
  });
}
