// 案例對照 docs/05-空檔推算單元測試案例.md，六個案例逐一驗證（含四捨五入方向、
// 碎片過濾、跨日、重疊合併、全天行程、取消狀態）。CONFIG 數值是測試用固定 fixture，
// 不代表 /7 空檔設定表的實際生產數值。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFreeSlots, type FreeSlotConfig, type ScheduleEntry } from "./freeSlots.ts";

const CONFIG: FreeSlotConfig = {
  dayStart: "05:00",
  dayEnd: "23:00",
  bufferBefore: 30,
  bufferAfter: 60,
  minSlot: 60,
  roundTo: 30,
};

function entry(start: string, end: string, opts: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return { start, end, allDay: false, status: "正常", ...opts };
}

test("案例 1：一般日", () => {
  const result = computeFreeSlots([entry("05:30", "14:30")], [], CONFIG);
  assert.deepEqual(result, [{ start: "15:30", end: "23:00" }]);
});

test("案例 2：跨日夜班（D+1 早上被佔用至 07:00）", () => {
  const result = computeFreeSlots([], [entry("22:00", "06:00")], CONFIG);
  assert.deepEqual(result, [{ start: "07:00", end: "23:00" }]);
});

test("案例 3：緩衝後重疊，合併成一段（中間不得出現空檔）", () => {
  const result = computeFreeSlots(
    [entry("09:30", "13:30"), entry("14:00", "22:00")],
    [],
    CONFIG,
  );
  assert.deepEqual(result, [{ start: "05:00", end: "09:00" }]);
});

test("案例 4：全天行程 → 當日回傳空陣列", () => {
  const result = computeFreeSlots(
    [entry("00:00", "00:00", { allDay: true })],
    [],
    CONFIG,
  );
  assert.deepEqual(result, []);
});

test("案例 5：碎片過濾（含四捨五入往內縮方向驗證）", () => {
  const result = computeFreeSlots(
    [entry("07:00", "09:00"), entry("11:10", "15:00")],
    [],
    CONFIG,
  );
  assert.deepEqual(result, [
    { start: "05:00", end: "06:30" },
    { start: "16:00", end: "23:00" },
  ]);
  // 明確斷言中間那段被壓到 minSlot 以下後不會出現
  assert.ok(!result.some((slot) => slot.start === "10:00"));
});

test("案例 6：狀態＝取消不造成佔用", () => {
  const result = computeFreeSlots(
    [entry("10:00", "12:00", { status: "取消" })],
    [],
    CONFIG,
  );
  assert.deepEqual(result, [{ start: "05:00", end: "23:00" }]);
});
