import type { TransactionList } from "@/lib/financeTypes";
import { json, queryParam, readBody } from "@/server/http";
import { handle, handleWrite } from "@/server/finance/route";
import { createTransaction, listTransactions, type TransactionBody } from "@/server/finance/service";
import { MONTH_RE } from "@/server/modules/dates";
import { TX_STATUS, TX_TYPE } from "@/server/finance/ragicFields";

// ?month=yyyy-MM&account=AC-001，日期新到舊。帳戶篩選含「轉入」該帳戶的轉帳。
// 小計只算已入帳的收入／支出，轉帳不計入。
export function GET(req: Request) {
  return handle("讀取明細", async () => {
    const month = queryParam(req, "month");
    const account = queryParam(req, "account");
    if (month !== undefined && !MONTH_RE.test(month)) return json({ success: false, error: "month 格式錯誤，須為 yyyy-MM" }, 400);

    const items = (await listTransactions())
      .filter((t) => (month ? t.date.startsWith(month) : true))
      .filter((t) => (account ? t.account === account || t.toAccount === account : true))
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));

    let income = 0;
    let expense = 0;
    for (const t of items) {
      if (t.status !== TX_STATUS.已入帳) continue;
      if (t.type === TX_TYPE.收入) income += t.amount;
      if (t.type === TX_TYPE.支出) expense += t.amount;
    }
    const result: TransactionList = { items, summary: { income, expense, net: income - expense } };
    return json(result);
  });
}

export function POST(req: Request) {
  return handleWrite("新增明細", async () => {
    const { id, code } = await createTransaction(await readBody<TransactionBody>(req));
    return json({ success: true, id, code });
  });
}
