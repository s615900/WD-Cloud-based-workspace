import { json } from "@/server/http";
import { listStatements } from "@/server/finance/entities";
import { handle } from "@/server/finance/route";

export function GET() {
  return handle("讀取信用卡帳單", async () => json(await listStatements()));
}
