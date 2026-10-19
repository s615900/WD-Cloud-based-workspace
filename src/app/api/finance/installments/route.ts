import { json, readBody } from "@/server/http";
import { createInstallment, type InstallmentBody } from "@/server/finance/entities";
import { loadContext } from "@/server/finance/engine";
import { handle, handleWrite } from "@/server/finance/route";
import { nextMonth } from "@/server/finance/dateUtil";
import { ACCOUNT_TYPE } from "@/server/finance/ragicFields";

export function GET() {
  return handle("讀取分期", async () => json((await loadContext()).installments));
}

export function POST(req: Request) {
  return handleWrite("新增分期", async () => {
    const ctx = await loadContext();
    // 首期帳單月份沒填時，依該卡結帳日由消費日推算；卡片沒設定結帳日就回 ""（由驗證擋下並提示）
    const defaultMonth = async (card: string, date: string) => {
      const closing = ctx.cards.find((c) => c.account === card)?.closingDay;
      const acc = ctx.accounts.find((a) => a.code === card);
      if (closing === undefined || acc?.type !== ACCOUNT_TYPE.信用卡) return "";
      return Number(date.slice(8, 10)) <= closing ? date.slice(0, 7) : nextMonth(date.slice(0, 7));
    };
    const id = await createInstallment(await readBody<InstallmentBody>(req), defaultMonth);
    return json({ success: true, id });
  });
}
