import { json, readBody } from "@/server/http";
import { createLoan, type LoanBody } from "@/server/finance/entities";
import { buildLoanView, loadContext } from "@/server/finance/engine";
import { handle } from "@/server/finance/route";
import { todayYMD } from "@/server/modules/dates";

// 貸款清單 + 攤還表 + 剩餘本金／已還期數（計算值，不寫回 Ragic）
export function GET() {
  return handle("讀取貸款", async () => {
    const ctx = await loadContext();
    const today = todayYMD();
    return json(ctx.loans.map((l) => buildLoanView(l, ctx.rateChanges, today)));
  });
}

export function POST(req: Request) {
  return handle("新增貸款", async () => json({ success: true, id: await createLoan(await readBody<LoanBody>(req)) }));
}
