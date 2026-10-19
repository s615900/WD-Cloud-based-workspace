import { json, readBody } from "@/server/http";
import { createRule, listRules, type RuleBody } from "@/server/finance/entities";
import { handle, handleWrite } from "@/server/finance/route";

export function GET() {
  return handle("讀取定期規則", async () => json(await listRules()));
}

export function POST(req: Request) {
  return handleWrite("新增定期規則", async () => json({ success: true, id: await createRule(await readBody<RuleBody>(req)) }));
}
