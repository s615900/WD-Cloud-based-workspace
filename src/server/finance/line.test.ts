import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFinanceCommand } from "./lineParse.ts";

test("LINE 指令解析：記／收／本月／待繳", () => {
  assert.deepEqual(parseFinanceCommand("記 午餐 120"), { kind: "expense", summary: "午餐", amount: 120, accountHint: "" });
  assert.deepEqual(parseFinanceCommand("記 午餐 120 CUBE"), { kind: "expense", summary: "午餐", amount: 120, accountHint: "CUBE" });
  assert.deepEqual(parseFinanceCommand("收 接案 15000"), { kind: "income", summary: "接案", amount: 15000, accountHint: "" });
  assert.deepEqual(parseFinanceCommand("本月"), { kind: "month" });
  assert.deepEqual(parseFinanceCommand("待繳"), { kind: "due" });
});

test("LINE 指令解析：不是財務指令的文字不攔截（含舊的「記得…」待辦）", () => {
  for (const t of ["記得帶護照", "記 午餐", "收 接案", "本月行程", "待辦 買牛奶", "今日待辦", "記 午餐 abc"]) {
    assert.equal(parseFinanceCommand(t), null, t);
  }
});
