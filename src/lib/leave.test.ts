// 人事假勤計算的單元測試：特休年資級距、週期起訖、月底日期、年度用量合併規則。
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsYMD, annualPeriod, annualUsedHours, monthsServed, yearStats, formatHours } from "./leave.ts";

const REF = "2026-10-08";

test("勞基法第 38 條年資級距", () => {
  const cases: [string, number, string | null, string, number][] = [
    // 到職日, 應給日數, 週期起, 週期迄(不含), 下一週期
    ["2026-05-01", 0, null, "2026-11-01", 3], // 未滿 6 個月
    ["2026-04-08", 3, "2026-10-08", "2027-04-08", 7], // 剛好滿 6 個月
    ["2025-10-09", 3, "2026-04-09", "2026-10-09", 7], // 差一天滿 1 年
    ["2025-10-08", 7, "2026-10-08", "2027-10-08", 10], // 剛好滿 1 年
    ["2023-03-15", 14, "2026-03-15", "2027-03-15", 14], // 滿 3 年
    ["2021-01-31", 15, "2026-01-31", "2027-01-31", 15], // 滿 5 年
    ["2015-10-08", 17, "2026-10-08", "2027-10-08", 18], // 滿 11 年
    ["2000-01-01", 30, "2026-01-01", "2027-01-01", 30], // 上限 30 日
  ];
  for (const [hire, days, start, end, next] of cases) {
    const p = annualPeriod(hire, REF);
    assert.deepEqual([p.days, p.start, p.end, p.nextDays], [days, start, end, next], `到職日 ${hire}`);
  }
});

test("月底到職：加月份夾到月底", () => {
  assert.equal(addMonthsYMD("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsYMD("2027-08-31", 6), "2028-02-29");
  assert.equal(monthsServed("2026-01-31", "2026-02-28"), 1);
  assert.equal(monthsServed("2026-01-31", "2026-02-27"), 0);
});

test("特休用量只算本週期", () => {
  const hire = "2023-03-15";
  const leaves = [
    { employeeId: 1, type: "特休", date: "2026-03-14", hours: 8 }, // 上一週期
    { employeeId: 1, type: "特休", date: "2026-03-15", hours: 8 },
    { employeeId: 1, type: "特休", date: "2026-09-01", hours: 4 },
    { employeeId: 2, type: "特休", date: "2026-09-01", hours: 8 }, // 別人
  ];
  assert.equal(annualUsedHours(leaves, 1, annualPeriod(hire, REF)), 12);
});

test("家庭照顧假併入事假、生理假超過 3 日併入病假", () => {
  const leaves = [
    { employeeId: 1, type: "事假", date: "2026-02-01", hours: 8 },
    { employeeId: 1, type: "家庭照顧假", date: "2026-03-01", hours: 3 },
    { employeeId: 1, type: "普通傷病假", date: "2026-04-01", hours: 16 },
    ...[1, 2, 3, 4, 5].map((m) => ({ employeeId: 1, type: "生理假", date: `2026-0${m}-10`, hours: 8 })),
    { employeeId: 1, type: "事假", date: "2025-12-31", hours: 8 }, // 去年
  ];
  const s = yearStats(leaves, 1, 2026);
  assert.equal(s.personalHours, 11);
  assert.equal(s.familyHours, 3);
  assert.equal(s.menstrualHours, 40);
  assert.equal(s.sickHours, 16 + 16);
});

test("時數顯示", () => {
  assert.equal(formatHours(16), "2 日");
  assert.equal(formatHours(3), "3 小時");
  assert.equal(formatHours(11), "1 日 3 小時");
});
