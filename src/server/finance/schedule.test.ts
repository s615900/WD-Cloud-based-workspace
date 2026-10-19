import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsYMD, clampYMD, eachDay, weekdayOf } from "./dateUtil.ts";
import { buildSchedule, type LoanTerms } from "./loan.ts";
import { splitInstallment, billMonthOfPeriod } from "./installment.ts";
import { paymentDates } from "./insurance.ts";
import { occursOn } from "./recurrence.ts";
import { closingDateOf, closingMonthOn, dueDateOf } from "./statement.ts";

test("日期：月底夾日、跨年加月", () => {
  assert.equal(clampYMD(2026, 2, 31), "2026-02-28");
  assert.equal(addMonthsYMD("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsYMD("2026-11-15", 3), "2027-02-15");
  assert.equal(weekdayOf("2026-10-19"), 1); // 週一
  assert.equal(eachDay("2026-10-30", "2026-11-02").length, 4);
});

test("定期規則：每月 31 號遇小月夾到月底", () => {
  const r = { freq: "每月", intervalN: 1, day: 31, start: "2026-01-01", end: "" };
  assert.equal(occursOn(r, "2026-02-28"), true);
  assert.equal(occursOn(r, "2026-02-27"), false);
  assert.equal(occursOn(r, "2026-04-30"), true);
  assert.equal(occursOn(r, "2026-05-31"), true);
});

test("定期規則：開始日之前／結束日之後不觸發；每 N 月、每年、每週", () => {
  const monthly = { freq: "每月", intervalN: 1, day: 5, start: "2026-03-01", end: "2026-06-30" };
  assert.equal(occursOn(monthly, "2026-02-05"), false);
  assert.equal(occursOn(monthly, "2026-03-05"), true);
  assert.equal(occursOn(monthly, "2026-07-05"), false);

  const every3 = { freq: "每N月", intervalN: 3, day: 10, start: "2026-01-01", end: "" };
  assert.deepEqual(
    ["2026-01-10", "2026-02-10", "2026-04-10", "2026-07-10"].map((d) => occursOn(every3, d)),
    [true, false, true, true],
  );

  const yearly = { freq: "每年", intervalN: 1, day: 20, start: "2026-08-01", end: "" };
  assert.equal(occursOn(yearly, "2027-08-20"), true);
  assert.equal(occursOn(yearly, "2027-09-20"), false);

  // 每週：執行日＝星期幾（1=週一），每 2 週
  const weekly = { freq: "每週", intervalN: 2, day: 1, start: "2026-10-05", end: "" };
  assert.deepEqual(
    ["2026-10-05", "2026-10-12", "2026-10-19"].map((d) => occursOn(weekly, d)),
    [true, false, true],
  );
});

test("貸款：本息平均，總本金等於核貸金額、末期餘額 0、每期金額幾乎固定", () => {
  const terms: LoanTerms = {
    principal: 1_000_000,
    annualRate: 0.0285,
    periods: 84,
    grace: 0,
    mode: "本息平均攤還",
    grantDate: "2026-01-15",
    payDay: 15,
  };
  const s = buildSchedule(terms);
  assert.equal(s.length, 84);
  assert.equal(s[0]!.due, "2026-02-15");
  assert.equal(s.at(-1)!.balance, 0);
  assert.equal(s.reduce((a, p) => a + p.principal, 0), 1_000_000);
  // 標準年金公式：1,000,000、年利率 2.85%、84 期 ≈ 每期 13,146（獨立以 Python 年金公式驗算）
  assert.ok(Math.abs(s[0]!.payment - 13_146) <= 1, `首期 ${s[0]!.payment}`);
  assert.ok(Math.abs(s[40]!.payment - s[0]!.payment) <= 1);
});

test("貸款：寬限期只繳利息；本金平均每期本金固定", () => {
  const grace = buildSchedule({
    principal: 120_000,
    annualRate: 0.06,
    periods: 12,
    grace: 2,
    mode: "本息平均攤還",
    grantDate: "2026-01-31",
    payDay: 31,
  });
  assert.equal(grace[0]!.principal, 0);
  assert.equal(grace[0]!.payment, 600); // 120000 × 0.5%
  assert.equal(grace[1]!.principal, 0);
  assert.ok(grace[2]!.principal > 0);
  assert.equal(grace[1]!.due, "2026-03-31");
  assert.equal(grace[0]!.due, "2026-02-28");
  assert.equal(grace.at(-1)!.balance, 0);

  const equalPrincipal = buildSchedule({
    principal: 12_000,
    annualRate: 0.12,
    periods: 12,
    grace: 0,
    mode: "本金平均攤還",
    grantDate: "2026-01-01",
    payDay: 1,
  });
  assert.equal(equalPrincipal[0]!.principal, 1000);
  assert.equal(equalPrincipal[0]!.interest, 120); // 12000 × 1%
  assert.equal(equalPrincipal[1]!.interest, 110);
  assert.equal(equalPrincipal.at(-1)!.balance, 0);
});

test("貸款：利率異動從生效日起以剩餘本金重算", () => {
  const terms: LoanTerms = {
    principal: 600_000,
    annualRate: 0.02,
    periods: 60,
    grace: 0,
    mode: "本息平均攤還",
    grantDate: "2026-01-10",
    payDay: 10,
  };
  const base = buildSchedule(terms);
  const changed = buildSchedule(terms, [{ effective: "2027-01-10", rate: 0.04 }]);
  assert.equal(changed[10]!.payment, base[10]!.payment); // 2026-12-10 還是舊利率
  assert.ok(changed[11]!.payment > base[11]!.payment); // 2027-01-10 起新利率
  assert.equal(changed.at(-1)!.balance, 0);
});

test("分期：尾差放首期或末期，手續費攤入各期", () => {
  assert.deepEqual(splitInstallment(10_000, 3, 0, true), [3334, 3333, 3333]);
  assert.deepEqual(splitInstallment(10_000, 3, 0, false), [3333, 3333, 3334]);
  const withFee = splitInstallment(10_000, 3, 100, true);
  assert.equal(withFee.reduce((a, b) => a + b, 0), 10_100);
  assert.deepEqual(withFee, [3334 + 34, 3333 + 33, 3333 + 33]);
  assert.equal(billMonthOfPeriod("2026-11", 3), "2027-01");
});

test("保險：月繳／年繳／躉繳的繳費日與終止日", () => {
  const monthly = { effective: "2026-01-31", freq: "月繳", payEnd: "", payYears: 0, maturity: "" };
  assert.deepEqual(paymentDates(monthly, "2026-02-01", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);

  const yearly = { effective: "2024-10-20", freq: "年繳", payEnd: "2027-10-19", payYears: 0, maturity: "" };
  assert.deepEqual(paymentDates(yearly, "2025-01-01", "2030-01-01"), ["2025-10-20", "2026-10-20"]);

  const byYears = { effective: "2024-10-20", freq: "年繳", payEnd: "", payYears: 3, maturity: "" };
  assert.deepEqual(paymentDates(byYears, "2024-01-01", "2030-01-01"), ["2024-10-20", "2025-10-20", "2026-10-20"]);

  const single = { effective: "2026-10-20", freq: "躉繳", payEnd: "", payYears: 0, maturity: "" };
  assert.deepEqual(paymentDates(single, "2026-10-01", "2027-10-01"), ["2026-10-20"]);
  assert.deepEqual(paymentDates(single, "2026-10-21", "2027-10-01"), []);
});

test("信用卡帳單：結帳日、繳款截止日（截止日 ≤ 結帳日算次月）", () => {
  assert.equal(closingDateOf("2026-02", 31), "2026-02-28");
  assert.equal(closingMonthOn("2026-10-15", 15), "2026-10");
  assert.equal(closingMonthOn("2026-10-14", 15), null);
  assert.equal(dueDateOf("2026-10", 15, 5), "2026-11-05");
  assert.equal(dueDateOf("2026-10", 5, 25), "2026-10-25");
  assert.equal(dueDateOf("2026-12", 15, 5), "2027-01-05");
});
