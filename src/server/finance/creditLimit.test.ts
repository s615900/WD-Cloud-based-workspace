import assert from "node:assert/strict";
import { test } from "node:test";
import { cardLimits } from "./creditLimit.ts";

test("同機構共用額度，分期剩餘也占用", () => {
  const cards = [
    { code: "AC-005", name: "J卡", institution: "富邦銀行", balance: 9560 },
    { code: "AC-008", name: "Costco", institution: "富邦銀行", balance: 0 },
    { code: "AC-003", name: "中信", institution: "中國信託", balance: 71168 },
  ];
  const limits: Record<string, number> = { "AC-005": 200000, "AC-008": 0, "AC-003": 200000 };
  const inst = [
    { card: "AC-008", status: "進行中", remaining: 106695 },
    { card: "AC-008", status: "已結清", remaining: 999 },
  ];
  const r = cardLimits(cards, (c) => limits[c] ?? 0, inst);
  assert.equal(r.get("AC-008")!.limit, 200000);
  assert.equal(r.get("AC-008")!.used, 116255);
  assert.equal(r.get("AC-005")!.remaining, 83745);
  assert.deepEqual(r.get("AC-005")!.shared, ["J卡", "Costco"]);
  assert.equal(r.get("AC-003")!.remaining, 128832);
});

test("沒填機構的卡不合併，沒設額度時 usage 為 null", () => {
  const cards = [
    { code: "A", name: "A", institution: "", balance: 100 },
    { code: "B", name: "B", institution: "", balance: 200 },
  ];
  const r = cardLimits(cards, (c) => (c === "A" ? 1000 : 0), []);
  assert.equal(r.get("A")!.remaining, 900);
  assert.equal(r.get("B")!.usage, null);
});
