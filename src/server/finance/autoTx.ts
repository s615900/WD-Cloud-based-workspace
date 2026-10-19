// 排程／繳款自動產生明細的寫入器：以「來源鍵」防重複（idempotent）、記憶體內維護流水號。
// dryRun 時只記錄「將產生」的內容，不寫 Ragic；寫入與否之外行為完全相同，所以預覽結果可信。

import type { TransactionItem } from "@/lib/financeTypes";
import { nextMonth, nowTaipeiStamp } from "./dateUtil";
import { finCreate } from "./ragic";
import { ACCOUNT_TYPE, F3, TX_SOURCE, TX_STATUS, type TxType } from "./ragicFields";
import type { FinanceContext } from "./engine";

export interface AutoTxSpec {
  date: string;
  type: TxType;
  amount: number;
  account: string;
  toAccount?: string;
  category?: string;
  summary: string;
  status: string; // 已入帳／預定
  source: string;
  sourceKey: string;
  billMonth?: string;
}

export class TxWriter {
  readonly created: AutoTxSpec[] = [];
  skippedExisting = 0;
  private keys: Set<string>;
  private counters = new Map<string, number>();

  constructor(
    private ctx: FinanceContext,
    private dryRun: boolean,
  ) {
    this.keys = new Set(ctx.txs.map((t) => t.sourceKey).filter(Boolean));
    for (const t of ctx.txs) {
      const m = t.code.match(/^(T-\d{8}-)(\d+)$/);
      if (m) this.counters.set(m[1]!, Math.max(this.counters.get(m[1]!) ?? 0, Number(m[2])));
    }
  }

  hasKey(key: string): boolean {
    return this.keys.has(key);
  }

  private billMonthFor(account: string, date: string): string {
    const acc = this.ctx.accounts.find((a) => a.code === account);
    if (!acc || acc.type !== ACCOUNT_TYPE.信用卡) return "";
    const closing = this.ctx.cards.find((c) => c.account === account)?.closingDay;
    if (closing === undefined) return "";
    const month = date.slice(0, 7);
    return Number(date.slice(8, 10)) <= closing ? month : nextMonth(month);
  }

  // 回傳 true＝這次新產生；false＝來源鍵已存在而跳過
  async emit(spec: AutoTxSpec): Promise<boolean> {
    if (this.keys.has(spec.sourceKey)) {
      this.skippedExisting++;
      return false;
    }
    const prefix = `T-${spec.date.replaceAll("-", "")}-`;
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    const code = `${prefix}${String(n).padStart(4, "0")}`;
    const billMonth = spec.billMonth ?? this.billMonthFor(spec.account, spec.date);

    if (!this.dryRun) {
      await finCreate("F3_TRANSACTION", {
        [F3.明細編號]: code,
        [F3.日期]: spec.date,
        [F3.類型]: spec.type,
        [F3.金額]: spec.amount,
        [F3.帳戶]: spec.account,
        [F3.轉入帳戶]: spec.toAccount ?? "",
        [F3.分類]: spec.category ?? "",
        [F3.摘要]: spec.summary,
        [F3.狀態]: spec.status,
        [F3.來源]: spec.source,
        [F3.來源鍵]: spec.sourceKey,
        [F3.帳單月份]: billMonth,
        [F3.建立時間]: nowTaipeiStamp(),
        [F3.備註]: "",
      });
    }
    this.keys.add(spec.sourceKey);
    this.created.push(spec);
    // 讓同一次執行的後續步驟（例如帳單彙總）看得到剛產生的明細
    const item: TransactionItem = {
      id: `new-${code}`,
      code,
      date: spec.date,
      type: spec.type,
      amount: spec.amount,
      account: spec.account,
      toAccount: spec.toAccount ?? "",
      category: spec.category ?? "",
      summary: spec.summary,
      status: spec.status as TransactionItem["status"],
      source: spec.source as TransactionItem["source"],
      sourceKey: spec.sourceKey,
      billMonth,
      createdAt: "",
      note: "",
    };
    this.ctx.txs.push(item);
    return true;
  }
}

export { TX_SOURCE, TX_STATUS };
