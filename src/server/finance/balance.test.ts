import { test } from "node:test";
import assert from "node:assert/strict";
import { BALANCE_LABELS, computeBalance, type BalanceAccount, type BalanceTx } from "./balance.ts";
import { ACCOUNT_TYPE, TX_STATUS, TX_TYPE } from "./ragicFields.ts";

const cash: BalanceAccount = { code: "AC-001", type: "現金", openingBalance: 5000, openingDate: "2026-10-01" };
const bank: BalanceAccount = { code: "AC-002", type: "銀行", openingBalance: 20000, openingDate: "2026-10-01" };
const card: BalanceAccount = { code: "AC-003", type: "信用卡", openingBalance: 0, openingDate: "2026-10-01" };

const tx = (o: Partial<BalanceTx>): BalanceTx => ({
  date: "2026-10-19",
  type: "支出",
  amount: 0,
  account: "",
  toAccount: "",
  status: "已入帳",
  ...o,
});

test("選項文字與 ragicFields 一致", () => {
  assert.equal(BALANCE_LABELS.income, TX_TYPE.收入);
  assert.equal(BALANCE_LABELS.expense, TX_TYPE.支出);
  assert.equal(BALANCE_LABELS.transfer, TX_TYPE.轉帳);
  assert.equal(BALANCE_LABELS.posted, TX_STATUS.已入帳);
  assert.equal(BALANCE_LABELS.card, ACCOUNT_TYPE.信用卡);
});

test("一般帳戶：期初 + 收入 − 支出", () => {
  const txs = [tx({ account: "AC-001", amount: 120 }), tx({ type: "收入", account: "AC-001", amount: 1000 })];
  assert.equal(computeBalance(cash, txs), 5000 - 120 + 1000);
});

test("轉帳：轉出減、轉入加", () => {
  const txs = [tx({ type: "轉帳", account: "AC-002", toAccount: "AC-001", amount: 3000 })];
  assert.equal(computeBalance(bank, txs), 17000);
  assert.equal(computeBalance(cash, txs), 8000);
});

test("信用卡：刷卡增加未繳、退款減少、轉入（繳卡費）減少", () => {
  const txs = [
    tx({ account: "AC-003", amount: 3000 }),
    tx({ type: "收入", account: "AC-003", amount: 500 }),
    tx({ type: "轉帳", account: "AC-002", toAccount: "AC-003", amount: 1000 }),
  ];
  assert.equal(computeBalance(card, txs), 3000 - 500 - 1000);
});

test("驗收情境：刷卡 3000 後由銀行轉帳 3000 繳清，未繳回到 0", () => {
  const txs = [
    tx({ account: "AC-003", amount: 3000 }),
    tx({ type: "轉帳", account: "AC-002", toAccount: "AC-003", amount: 3000 }),
  ];
  assert.equal(computeBalance(card, txs), 0);
  assert.equal(computeBalance(bank, txs), 17000);
});

test("預定狀態與期初日期之前的明細不計入", () => {
  const txs = [
    tx({ account: "AC-001", amount: 100, status: "預定" }),
    tx({ account: "AC-001", amount: 200, date: "2026-09-30" }),
  ];
  assert.equal(computeBalance(cash, txs), 5000);
});

test("與帳戶無關的明細不影響餘額", () => {
  assert.equal(computeBalance(cash, [tx({ account: "AC-002", amount: 999 })]), 5000);
});
