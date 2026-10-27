import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, nextOccurrence } from "./countdown.ts";

test("天數：同一天是 0，跨月跨年正確", () => {
  assert.equal(daysBetween("2026-10-27", "2026-10-27"), 0);
  assert.equal(daysBetween("2026-10-27", "2026-11-03"), 7);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

test("單次倒數：未來有天數、今天是 0、過了就不顯示", () => {
  assert.deepEqual(nextOccurrence("2026-12-25", false, "2026-10-27"), { date: "2026-12-25", daysLeft: 59 });
  assert.deepEqual(nextOccurrence("2026-10-27", false, "2026-10-27"), { date: "2026-10-27", daysLeft: 0 });
  assert.equal(nextOccurrence("2026-10-26", false, "2026-10-27"), null);
});

test("每年重複：今年還沒到用今年，已過用明年，當天算 0", () => {
  assert.deepEqual(nextOccurrence("1995-12-05", true, "2026-10-27"), { date: "2026-12-05", daysLeft: 39 });
  assert.deepEqual(nextOccurrence("1995-03-01", true, "2026-10-27"), { date: "2027-03-01", daysLeft: 125 });
  assert.deepEqual(nextOccurrence("1995-10-27", true, "2026-10-27"), { date: "2026-10-27", daysLeft: 0 });
});

test("每年重複的 2/29：非閏年落在 2/28", () => {
  assert.equal(nextOccurrence("2024-02-29", true, "2026-10-27")?.date, "2027-02-28");
  assert.equal(nextOccurrence("2024-02-29", true, "2027-10-27")?.date, "2028-02-29");
});

test("日期格式錯誤回傳 null", () => {
  assert.equal(nextOccurrence("", true, "2026-10-27"), null);
});
