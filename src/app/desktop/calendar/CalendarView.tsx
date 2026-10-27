"use client";

import { useCallback, useEffect, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/ui";
import {
  addDays,
  addMonths,
  apiFetch,
  currentMonth,
  errorText,
  monthCells,
  monthCellsPadded,
  todayISO,
  weekdayOf,
  WEEKDAYS,
} from "@/lib/client";
import type { FreeSlot, RosterConfig, RosterEntry, RosterTemplate } from "@/lib/types";
import { DayPanel } from "./DayPanel";
import { PublishModal } from "./CalendarModals";

const startOfWeek = (ymd: string) => addDays(ymd, -weekdayOf(ymd));
const entryColor = (e: RosterEntry) => (e.status === "取消" ? "#B7C2CC" : e.color || "#5A6570");

// 賽事（以及其他非班別的多天行程）連續幾天同名時，月曆上接成「一條」橫跨多天的色條。
// 一般班別（駿斯早班…）每天各自一條，不接，不然每週一到五的班會變成一條長長的色帶。
const joinKey = (e: RosterEntry): string | null => (e.kind !== "班別" || e.title === "拍攝賽事" ? `${e.kind}|${e.title}` : null);

// 每一天的「行」：同一個賽事連續幾天固定在同一行，色條才接得起來；每週日重新排。
function buildLanes(dates: string[], entriesOf: (d: string) => RosterEntry[]): Map<string, (RosterEntry | null)[]> {
  const out = new Map<string, (RosterEntry | null)[]>();
  let prev: (RosterEntry | null)[] = [];
  for (const date of dates) {
    const list = [...entriesOf(date)].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title) || a.id - b.id);
    const lanes: (RosterEntry | null)[] = [];
    const placed = new Set<number>();
    if (weekdayOf(date) !== 0) {
      prev.forEach((pe, i) => {
        const k = pe && joinKey(pe);
        if (!k) return;
        const cur = list.find((e) => !placed.has(e.id) && joinKey(e) === k);
        if (cur) {
          lanes[i] = cur;
          placed.add(cur.id);
        }
      });
    }
    for (const e of list) {
      if (placed.has(e.id)) continue;
      let i = 0;
      while (lanes[i]) i++;
      lanes[i] = e;
      placed.add(e.id);
    }
    const filled = Array.from(lanes, (x) => x ?? null);
    out.set(date, filled);
    prev = filled;
  }
  return out;
}

type Span = { e: RosterEntry; lane: number; start: number; end: number; contPrev: boolean; contNext: boolean };

// 一週（7 格）裡要畫的色條：連續同名的賽事合成一條橫跨多格，一般班別每天一條。
function weekSpans(week: { date: string }[], lanesByDate: Map<string, (RosterEntry | null)[]>): Span[] {
  const spans: Span[] = [];
  const same = (a: RosterEntry | null | undefined, k: string | null) => !!a && !!k && joinKey(a) === k;
  week.forEach(({ date }, col) => {
    (lanesByDate.get(date) ?? []).forEach((e, lane) => {
      if (!e) return;
      const k = joinKey(e);
      if (col > 0 && same(lanesByDate.get(week[col - 1]!.date)?.[lane], k)) return; // 已經算在前面那一條裡
      let end = col;
      while (end < 6 && same(lanesByDate.get(week[end + 1]!.date)?.[lane], k)) end++;
      // 跨週的賽事：這一週的頭尾切平，看得出前面（後面）還有
      const before = lanesByDate.get(addDays(date, -1)) ?? [];
      const after = lanesByDate.get(addDays(week[end]!.date, 1)) ?? [];
      spans.push({ e, lane, start: col, end, contPrev: col === 0 && before.some((x) => same(x, k)), contNext: end === 6 && after.some((x) => same(x, k)) });
    });
  });
  return spans;
}

export function CalendarView({ initialDate }: { initialDate: string | null }) {
  const [config, setConfig] = useState<RosterConfig | null>(null);
  const [view, setView] = useState<"month" | "week">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => (initialDate ? initialDate.slice(0, 7) : currentMonth()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate ?? todayISO()));
  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? todayISO());
  // 行事曆只留「拍攝賽事」模板可直接排；其他班別改從預排班頁匯入
  const [templates, setTemplates] = useState<RosterTemplate[]>([]);
  const [picked, setPicked] = useState<RosterTemplate | null>(null);
  // 排班資料或空檔規則變動時遞增，觸發行事曆與右側面板重新載入
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const [modal, setModal] = useState<{ kind: "publish" } | null>(null);

  useEffect(() => {
    apiFetch<RosterTemplate[]>("/api/roster/templates").then(
      (list) => setTemplates(list.filter((t) => t.active && t.name === "拍攝賽事")),
      () => setTemplates([]),
    );
    apiFetch<RosterConfig>("/api/roster/config").then(setConfig, () => setConfig(null));
  }, []);

  async function onDateClick(date: string) {
    if (picked) {
      try {
        await apiFetch("/api/roster/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, templateCode: picked.code }),
        });
      } catch (err) {
        alert(errorText(err, "排入失敗"));
      }
      setPicked(null);
    }
    setSelectedDate(date);
    refresh();
  }

  // 後台改了拍攝賽事模板的時間後，把「目前顯示月份」已排的拍攝賽事更新成模板現在的時間
  // （排班當下會把模板時間抄一份，之後改模板不會自動更新）
  const [syncing, setSyncing] = useState(false);
  async function syncTemplateTimes() {
    const t = templates[0];
    if (!t) return;
    setSyncing(true);
    try {
      const cells = monthCells(calendarMonth).filter(Boolean) as string[];
      const all = await apiFetch<RosterEntry[]>(`/api/roster/schedule?from=${cells[0]}&to=${cells[cells.length - 1]}`);
      const todo = all.filter(
        (e) => e.kind === "班別" && e.title === t.name && e.date.startsWith(calendarMonth) && (e.start !== t.start || e.end !== t.end),
      );
      if (todo.length === 0) {
        alert(`${calendarMonth} 的「${t.name}」時間都已經跟模板一致（${t.start}–${t.end}）`);
        return;
      }
      if (!confirm(`把 ${calendarMonth} 的 ${todo.length} 筆「${t.name}」改成模板時間 ${t.start}–${t.end}？`)) return;
      const results = await Promise.allSettled(
        todo.map((e) =>
          apiFetch(`/api/roster/schedule/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: t.start, end: t.end }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) alert(`有 ${failed} 筆更新失敗，請再按一次`);
    } catch (err) {
      alert(errorText(err, "同步失敗"));
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  function go(delta: number) {
    if (view === "month") setCalendarMonth((m) => addMonths(m, delta));
    else setWeekStart((w) => addDays(w, delta * 7));
  }

  return (
    <>
      <PageHeader
        title="行事曆"
        subtitle="空檔推算與公布——跟 LINE Bot 行程資料共用同一張排班表"
        actions={
          <>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${picked?.id === t.id ? "btn-primary" : "btn-outline"}`}
                title={picked?.id === t.id ? `點日曆上的日期即可排入「${t.name}」，再點一次取消` : undefined}
                onClick={() => setPicked(picked?.id === t.id ? null : t)}
              >
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            {templates.length > 0 && (
              <button type="button" className="btn btn-outline" disabled={syncing} onClick={syncTemplateTimes}>
                {syncing ? "同步中…" : "同步賽事時間"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                // 開放預約：直接開啟設定裡的預約連結
                if (config?.bookingUrl) window.open(config.bookingUrl, "_blank", "noopener");
                else alert("尚未設定預約連結，請先在 Ragic 設定表填入預約連結。");
              }}
            >
              開放預約
            </button>
            <button type="button" className="btn btn-gold" onClick={() => setModal({ kind: "publish" })}>
              分享空檔
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col">
          <section className="card mb-5 flex-1 xl:mb-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="mb-0">
                {view === "month" ? calendarMonth : `${weekStart} ～ ${addDays(weekStart, 6)}`}
              </h3>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:gap-2.5 [&_.btn]:max-sm:flex-1 [&_.btn]:max-sm:px-2">
                <div className="flex w-full gap-2 sm:w-[140px]">
                  {(["month", "week"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`flex-1 cursor-pointer rounded-[10px] border-2 py-2 text-[13px] font-bold ${
                        view === v ? "border-navy bg-navy text-white" : "border-line bg-white text-muted"
                      }`}
                    >
                      {v === "month" ? "月" : "週"}
                    </button>
                  ))}
                </div>
                <div className="nav-compact flex w-full items-center gap-2.5 sm:w-auto">
                <button className="btn btn-outline" onClick={() => go(-1)}>
                  ‹ 上頁
                </button>
                {view === "month" ? (
                  <MonthPicker value={calendarMonth} onChange={setCalendarMonth} />
                ) : (
                  <input
                    className="input"
                    style={{ width: "auto" }}
                    type="date"
                    value={weekStart}
                    onChange={(e) => e.target.value && setWeekStart(startOfWeek(e.target.value))}
                    aria-label="跳到某一週"
                  />
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setCalendarMonth(currentMonth());
                    setWeekStart(startOfWeek(todayISO()));
                    setSelectedDate(todayISO());
                  }}
                >
                  今天
                </button>
                <button className="btn btn-outline" onClick={() => go(1)}>
                  下頁 ›
                </button>
                </div>
              </div>
            </div>
            <CalendarBody
              view={view}
              calendarMonth={calendarMonth}
              weekStart={weekStart}
              selectedDate={selectedDate}
              version={version}
              onDateClick={onDateClick}
            />
          </section>
        </div>

        <DayPanel date={selectedDate} version={version} onChanged={refresh} />
      </div>

      {modal?.kind === "publish" && <PublishModal publishDays={config?.publishDays} onClose={() => setModal(null)} />}
    </>
  );
}

function CalendarBody({
  view,
  calendarMonth,
  weekStart,
  selectedDate,
  version,
  onDateClick,
}: {
  view: "month" | "week";
  calendarMonth: string;
  weekStart: string;
  selectedDate: string;
  version: number;
  onDateClick: (date: string) => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; key: string; entries: RosterEntry[]; free: Record<string, FreeSlot[]> }
  >({ status: "loading" });

  const rangeKey = view === "month" ? `m:${calendarMonth}` : `w:${weekStart}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (view === "month") {
          const cells = monthCellsPadded(calendarMonth).map((c) => c.date);
          const entries = await apiFetch<RosterEntry[]>(
            `/api/roster/schedule?from=${cells[0]}&to=${cells[cells.length - 1]}`,
          );
          if (alive) setState({ status: "ok", key: rangeKey, entries, free: {} });
        } else {
          const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
          const [entries, freeList] = await Promise.all([
            apiFetch<RosterEntry[]>(`/api/roster/schedule?from=${dates[0]}&to=${dates[6]}`),
            Promise.all(
              dates.map((date) =>
                apiFetch<{ slots: FreeSlot[] }>(`/api/roster/free-slots?date=${date}`).then(
                  (r) => r.slots,
                  () => [] as FreeSlot[],
                ),
              ),
            ),
          ]);
          const free = Object.fromEntries(dates.map((d, i) => [d, freeList[i]]));
          if (alive) setState({ status: "ok", key: rangeKey, entries, free });
        }
      } catch (err) {
        if (alive) setState({ status: "error", message: errorText(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [view, calendarMonth, weekStart, version, rangeKey]);

  if (state.status === "error") return <p className="empty-hint">無法載入（{state.message}）</p>;
  if (state.status === "loading" || state.key !== rangeKey) return <p className="empty-hint">載入中…</p>;

  const entriesOf = (date: string) =>
    state.entries.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start));

  if (view === "month") {
    const grid = monthCellsPadded(calendarMonth);
    const lanesByDate = buildLanes(grid.map((c) => c.date), entriesOf);
    const weeks = Array.from({ length: grid.length / 7 }, (_, w) => grid.slice(w * 7, w * 7 + 7));
    const countFrom = (date: string, from: number) => (lanesByDate.get(date) ?? []).slice(from).filter(Boolean).length;
    return (
      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-xs text-muted">
              {w}
            </div>
          ))}
        </div>
        <div className="space-y-1 sm:space-y-1.5">
          {weeks.map((week) => (
            <div key={week[0]!.date} className="relative">
              {/* 底層：日期格（只放日期數字與「+N」；色條在上面一層畫，賽事才能一條橫跨多天） */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {week.map(({ date, outside }) => {
                  const selected = date === selectedDate;
                  return (
                    <div
                      key={date}
                      onClick={() => onDateClick(date)}
                      className={`relative min-h-[68px] min-w-0 cursor-pointer rounded-[9px] border px-[3px] py-1 hover:border-navy sm:min-h-[96px] sm:px-[7px] sm:py-1.5 ${
                        selected ? "border-navy bg-navy-soft shadow-[inset_0_0_0_1px_var(--color-navy)]" : outside ? "border-line bg-[#FAFCFD]" : "border-line bg-white"
                      }`}
                    >
                      <div className={`text-[13px] font-bold ${outside ? "font-normal text-muted/60" : ""}`}>
                        {outside && Number(date.slice(8)) === 1 ? `${Number(date.slice(5, 7))}/` : ""}
                        {Number(date.slice(8))}
                      </div>
                      {countFrom(date, 2) > 0 && (
                        <div className="absolute right-1 bottom-0.5 text-[9px] leading-3 text-muted sm:hidden">+{countFrom(date, 2)}</div>
                      )}
                      {countFrom(date, 3) > 0 && (
                        <div className="absolute right-1.5 bottom-1 hidden text-[10px] leading-3 text-muted sm:block">+{countFrom(date, 3)} 筆</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 上層：色條。點色條會穿透到下面的日期格，點哪天就選到哪天 */}
              <div className="pointer-events-none absolute inset-x-0 top-[26px] grid auto-rows-[14px] grid-cols-7 gap-x-1 gap-y-0.5 sm:top-[28px] sm:auto-rows-[16px] sm:gap-x-1.5 sm:gap-y-1">
                {weekSpans(week, lanesByDate)
                  .filter((sp) => sp.lane < 3)
                  .map((sp) => {
                    const allOutside = week.slice(sp.start, sp.end + 1).every((c) => c.outside);
                    return (
                      <div
                        key={`${sp.e.id}-${sp.start}`}
                        className={`mx-[4px] overflow-hidden px-[3px] text-[9px] leading-[14px] font-bold text-ellipsis whitespace-nowrap text-white sm:mx-[8px] sm:px-[6px] sm:text-[11px] sm:leading-[16px] ${
                          allOutside ? "opacity-45" : ""
                        } ${sp.lane >= 2 ? "max-sm:hidden" : ""} ${sp.contPrev ? "rounded-l-none" : "rounded-l-[4px]"} ${sp.contNext ? "rounded-r-none" : "rounded-r-[4px]"}`}
                        style={{ gridColumn: `${sp.start + 1} / ${sp.end + 2}`, gridRow: sp.lane + 1, background: entryColor(sp.e) }}
                        title={sp.e.title}
                      >
                        {sp.e.title}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {dates.map((date) => {
          const entries = entriesOf(date);
          const free = state.free[date] ?? [];
          return (
            <div
              key={date}
              onClick={() => onDateClick(date)}
              className={`min-w-0 cursor-pointer rounded-[10px] border p-2 hover:border-navy md:min-h-40 ${
                date === selectedDate ? "border-navy bg-navy-soft" : "border-line bg-white"
              }`}
            >
              <div className="mb-1.5 text-xs font-bold">
                {date.slice(5).replace("-", "/")}（{WEEKDAYS[weekdayOf(date)]}）
              </div>
              {entries.length === 0 && <p className="form-hint">無行程</p>}
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="mb-1 rounded border-l-[3px] bg-page px-1.5 py-[3px] text-[11.5px]"
                  style={{ borderLeftColor: entryColor(e) }}
                >
                  {e.start}–{e.end} {e.title}
                  {e.status === "取消" ? "（已取消）" : ""}
                </div>
              ))}
              {free.length ? (
                <>
                  <div className="mt-1.5 text-[10.5px] font-bold text-teal">空檔 {free.length} 段</div>
                  {free.map((s) => (
                    <div key={s.start} className="form-hint">
                      {s.start}–{s.end}
                    </div>
                  ))}
                </>
              ) : (
                <div className="mt-1.5 text-[10.5px] font-bold text-muted">無空檔</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
