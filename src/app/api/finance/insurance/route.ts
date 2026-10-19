import { json, readBody } from "@/server/http";
import { createPolicy, type PolicyBody } from "@/server/finance/entities";
import { buildPolicyView, loadContext } from "@/server/finance/engine";
import { handle, handleWrite } from "@/server/finance/route";
import { todayYMD } from "@/server/modules/dates";

export function GET() {
  return handle("讀取保險", async () => {
    const ctx = await loadContext();
    const today = todayYMD();
    return json(ctx.policies.map((p) => buildPolicyView(p, today)));
  });
}

export function POST(req: Request) {
  return handleWrite("新增保單", async () => json({ success: true, id: await createPolicy(await readBody<PolicyBody>(req)) }));
}
