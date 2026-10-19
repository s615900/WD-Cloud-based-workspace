import { json, readBody } from "@/server/http";
import { computeBalances } from "@/server/finance/balance";
import { handle } from "@/server/finance/route";
import { createAccount, listAccounts, listTransactions, type AccountBody } from "@/server/finance/service";

// 帳戶清單 + 即時計算的目前餘額（信用卡是「未繳」）。餘額只在記憶體算，不寫回 Ragic。
export function GET() {
  return handle("讀取帳戶", async () => {
    const [accounts, txs] = await Promise.all([listAccounts(), listTransactions()]);
    const balances = computeBalances(accounts, txs);
    return json(accounts.map((a) => ({ ...a, balance: balances.get(a.code) ?? a.openingBalance })));
  });
}

export function POST(req: Request) {
  return handle("新增帳戶", async () => {
    const id = await createAccount(await readBody<AccountBody>(req));
    return json({ success: true, id });
  });
}
