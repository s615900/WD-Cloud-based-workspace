import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublishText, buildShortPublishText } from "./publish.ts";

test("完全沒有空檔 → 只輸出「本週已排滿，下週再約。」", () => {
  const text = buildPublishText(
    [
      { date: "2026-08-31", slots: [] },
      { date: "2026-09-01", slots: [] },
    ],
    "https://example.com/book",
  );
  assert.equal(text, "本週已排滿，下週再約。");
});

test("有空檔＋有預約連結 → 含日期標頭、時段與連結", () => {
  const text = buildPublishText(
    [
      { date: "2026-08-31", slots: [{ start: "09:00", end: "12:00" }] },
      { date: "2026-09-01", slots: [] },
    ],
    "https://example.com/book",
  );
  assert.equal(
    text,
    [
      "【可預約時段】",
      "",
      "8/31（一）",
      "　09:00–12:00",
      "",
      "▸ 預約：https://example.com/book",
    ].join("\n"),
  );
});

test("預約連結為空字串 → 省略連結區塊", () => {
  const text = buildPublishText(
    [{ date: "2026-08-31", slots: [{ start: "09:00", end: "10:30" }] }],
    "",
  );
  assert.equal(text, ["【可預約時段】", "", "8/31（一）", "　09:00–10:30"].join("\n"));
});

test("預約連結只有空白字元 → 視同空字串，省略連結區塊", () => {
  const text = buildPublishText(
    [{ date: "2026-08-31", slots: [{ start: "09:00", end: "09:45" }] }],
    "   ",
  );
  assert.equal(text, ["【可預約時段】", "", "8/31（一）", "　09:00–09:45"].join("\n"));
});

test("多天多段空檔、日期不相鄰 → 不合併，各自列出標頭與所有時段", () => {
  const text = buildPublishText(
    [
      { date: "2026-08-31", slots: [{ start: "09:00", end: "12:00" }] },
      {
        date: "2026-09-02",
        slots: [
          { start: "09:00", end: "10:00" },
          { start: "15:00", end: "18:00" },
        ],
      },
    ],
    "",
  );
  assert.equal(
    text,
    [
      "【可預約時段】",
      "",
      "8/31（一）",
      "　09:00–12:00",
      "",
      "9/2（三）",
      "　09:00–10:00",
      "　15:00–18:00",
    ].join("\n"),
  );
});

test("連續 3 日時段相同 → 合併為一組區間", () => {
  const text = buildPublishText(
    [
      { date: "2026-08-29", slots: [{ start: "08:00", end: "23:00" }] },
      { date: "2026-08-30", slots: [{ start: "08:00", end: "23:00" }] },
      { date: "2026-08-31", slots: [{ start: "08:00", end: "23:00" }] },
    ],
    "",
  );
  assert.equal(text, ["【可預約時段】", "", "8/29（六）～8/31（一）", "　08:00–23:00"].join("\n"));
});

test("連續 2 日時段不同 → 不合併", () => {
  const text = buildPublishText(
    [
      { date: "2026-09-01", slots: [{ start: "15:30", end: "17:30" }] },
      { date: "2026-09-02", slots: [{ start: "10:00", end: "12:00" }] },
    ],
    "",
  );
  assert.equal(
    text,
    [
      "【可預約時段】",
      "",
      "9/1（二）",
      "　15:30–17:30",
      "",
      "9/2（三）",
      "　10:00–12:00",
    ].join("\n"),
  );
});

test("單日 → 不顯示為區間", () => {
  const text = buildPublishText([{ date: "2026-09-06", slots: [{ start: "10:00", end: "12:00" }] }], "");
  assert.equal(text, ["【可預約時段】", "", "9/6（日）", "　10:00–12:00"].join("\n"));
});

test("兩組合併區間各自獨立＋有預約連結 → 完整訊息符合目標格式", () => {
  const text = buildPublishText(
    [
      { date: "2026-08-29", slots: [{ start: "08:00", end: "23:00" }] },
      { date: "2026-08-30", slots: [{ start: "08:00", end: "23:00" }] },
      { date: "2026-08-31", slots: [{ start: "08:00", end: "23:00" }] },
      { date: "2026-09-01", slots: [{ start: "15:30", end: "17:30" }] },
      { date: "2026-09-02", slots: [{ start: "15:30", end: "17:30" }] },
      { date: "2026-09-03", slots: [{ start: "15:30", end: "17:30" }] },
      { date: "2026-09-04", slots: [{ start: "15:30", end: "17:30" }] },
    ],
    "https://asset-manager-s615900.replit.app/book.html",
  );
  assert.equal(
    text,
    [
      "【可預約時段】",
      "",
      "8/29（六）～8/31（一）",
      "　08:00–23:00",
      "",
      "9/1（二）～9/4（五）",
      "　15:30–17:30",
      "",
      "▸ 預約：https://asset-manager-s615900.replit.app/book.html",
    ].join("\n"),
  );
});

test("buildShortPublishText：有預約連結 → 兩行", () => {
  const text = buildShortPublishText("https://example.com/book");
  assert.equal(text, ["✅ 空檔已更新", "▸ https://example.com/book"].join("\n"));
});

test("buildShortPublishText：預約連結為空字串 → 只有第一行", () => {
  const text = buildShortPublishText("");
  assert.equal(text, "✅ 空檔已更新");
});

test("buildShortPublishText：預約連結只有空白字元 → 視同空字串，只有第一行", () => {
  const text = buildShortPublishText("   ");
  assert.equal(text, "✅ 空檔已更新");
});
