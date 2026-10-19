import { json } from "@/server/http";
import { buildOverview, loadContext } from "@/server/finance/engine";
import { handle } from "@/server/finance/route";
import { todayYMD } from "@/server/modules/dates";

export function GET() {
  return handle("讀取總覽", async () => json(buildOverview(await loadContext(), todayYMD())));
}
