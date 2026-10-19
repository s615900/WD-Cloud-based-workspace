// 帳戶餘額計算：純函式、不碰 Ragic，F3 以後重用與測試都用這支。計算值只在記憶體裡，不寫回 Ragic。
//
// 只計入「狀態＝已入帳」且「日期 ≥ 該帳戶期初日期」的明細（日期都是 yyyy-MM-dd，字串比較即可）。
//   一般帳戶（銀行／現金／電子支付）：期初 + 收入 − 支出 − 轉出 + 轉入
//   信用卡（回傳「目前未繳」，正數代表欠款）：期初 + 支出 − 收入（退款）− 轉入（繳卡費）

export interface BalanceAccount {
  code: string;
  type: string;
  openingBalance: number;
  openingDate: string;
}

export interface BalanceTx {
  date: string;
  type: string;
  amount: number;
  account: string;
  toAccount: string;
  status: string;
}

// 這支是純函式檔，選項文字在這裡重複宣告而不 import ragicFields，方便單元測試獨立執行；
// 與 ragicFields.ts 的 TX_TYPE／TX_STATUS／ACCOUNT_TYPE 必須一致（balance.test.ts 有對照測試）。
export const BALANCE_LABELS = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  posted: "已入帳",
  card: "信用卡",
} as const;

function countsFor(account: BalanceAccount, date: string): boolean {
  return !account.openingDate || date >= account.openingDate;
}

export function computeBalance(account: BalanceAccount, txs: BalanceTx[]): number {
  const L = BALANCE_LABELS;
  const isCard = account.type === L.card;
  let balance = account.openingBalance;

  for (const t of txs) {
    if (t.status !== L.posted) continue;
    if (!countsFor(account, t.date)) continue;

    if (t.type === L.income && t.account === account.code) {
      balance += isCard ? -t.amount : t.amount;
    } else if (t.type === L.expense && t.account === account.code) {
      balance += isCard ? t.amount : -t.amount;
    } else if (t.type === L.transfer) {
      if (t.account === account.code && !isCard) balance -= t.amount; // 轉出
      if (t.toAccount === account.code) balance += isCard ? -t.amount : t.amount; // 轉入／繳卡費
    }
  }
  return balance;
}

export function computeBalances(accounts: BalanceAccount[], txs: BalanceTx[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const a of accounts) result.set(a.code, computeBalance(a, txs));
  return result;
}
