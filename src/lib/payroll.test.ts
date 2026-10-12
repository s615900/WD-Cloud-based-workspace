import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHours, paidMinutes, shiftPay, spanMinutes, summarize } from "./payroll.ts";

test("一般班：09:00–18:00 扣 60 分鐘休息 = 8 小時", () => {
  assert.equal(spanMinutes("09:00", "18:00"), 540);
  assert.equal(paidMinutes({ start: "09:00", end: "18:00", breakMin: 60 }), 480);
});

test("跨日班：22:00–06:00 = 8 小時", () => {
  assert.equal(spanMinutes("22:00", "06:00"), 480);
});

test("開始等於結束算 0，不會變成 24 小時", () => {
  assert.equal(spanMinutes("09:00", "09:00"), 0);
});

test("休息比班還長，計薪分鐘不會變負數", () => {
  assert.equal(paidMinutes({ start: "09:00", end: "10:00", breakMin: 90 }), 0);
});

test("薪資：8 小時 × 時薪 190 = 1520", () => {
  assert.equal(shiftPay({ start: "09:00", end: "18:00", breakMin: 60, rate: 190 }), 1520);
});

test("薪資逐筆四捨五入到整數元：6 小時 40 分 × 183 = 1220", () => {
  assert.equal(shiftPay({ start: "10:00", end: "16:40", breakMin: 0, rate: 183 }), 1220);
});

test("工時文字", () => {
  assert.equal(formatHours(450), "7.5");
  assert.equal(formatHours(480), "8");
  assert.equal(formatHours(400), "6.67");
});

test("月彙總：依班別分組加總", () => {
  const shifts = [
    { code: "A", name: "早班", start: "09:00", end: "13:00", breakMin: 0, rate: 200 },
    { code: "A", name: "早班", start: "09:00", end: "13:00", breakMin: 0, rate: 200 },
    { code: "B", name: "晚班", start: "17:00", end: "22:00", breakMin: 30, rate: 220 },
  ];
  const s = summarize(shifts, (x) => ({ key: x.code, label: x.name }));
  assert.equal(s.count, 3);
  assert.equal(s.minutes, 240 + 240 + 270);
  assert.equal(s.pay, 800 + 800 + 990);
  assert.deepEqual(
    s.groups.map((g) => [g.label, g.count, g.pay]),
    [
      ["早班", 2, 1600],
      ["晚班", 1, 990],
    ],
  );
});
