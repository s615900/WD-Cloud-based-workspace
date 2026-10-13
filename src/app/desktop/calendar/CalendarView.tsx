"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import {
  addDays,
  addMonths,
  apiFetch,
  currentMonth,
  errorText,
  monthCells,
  todayISO,
  weekdayOf,
  WEEKDAYS,
} from "@/lib/client";
import type { FreeSlot, RosterConfig, RosterEntry, RosterTemplate } from "@/lib/types";
import { DayPanel } from "./DayPanel";
import { PublishModal } from "./CalendarModals";

const startOfWeek = (ymd: string) => addDays(ymd, -weekdayOf(ymd));
const entryColor = (e: RosterEntry) => (e.status === "取消" ? "#B7C2CC" : e.color || "#5A6570");

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
                <button className="btn btn-outline" onClick={() => go(-1)}>
                  ‹ 上頁
                </button>
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
          const cells = monthCells(calendarMonth).filter(Boolean) as string[];
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
    return (
      <div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-xs text-muted">
              {w}
            </div>
          ))}
          {monthCells(calendarMonth).map((date, i) => {
            if (!date)
              return <div key={`pad-${i}`} className="min-h-[68px] rounded-[9px] border border-line bg-[#FAFCFD] sm:min-h-[90px]" />;
            const entries = entriesOf(date);
            const selected = date === selectedDate;
            return (
              <div
                key={date}
                onClick={() => onDateClick(date)}
                className={`min-h-[68px] min-w-0 cursor-pointer rounded-[9px] border px-[3px] py-1 hover:border-navy sm:min-h-[90px] sm:px-[7px] sm:py-1.5 ${
                  selected ? "border-navy bg-navy-soft shadow-[inset_0_0_0_1px_var(--color-navy)]" : "border-line bg-white"
                }`}
              >
                <div className="text-[13px] font-bold">{Number(date.slice(8))}</div>
                {/* 手機：跟舊版一樣用彩色色條顯示名稱，格子窄所以字縮小、最多 2 條 */}
                <div className="sm:hidden">
                  {entries.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="mt-0.5 overflow-hidden rounded-[3px] px-[2px] text-[9px] leading-[14px] font-bold whitespace-nowrap text-white"
                      style={{ background: entryColor(e) }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {entries.length > 2 && (
                    <div className="text-center text-[9px] leading-3 text-muted">+{entries.length - 2}</div>
                  )}
                </div>
                {/* 平板／電腦：行程條 */}
                <div className="hidden sm:block">
                  {entries.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="mt-1 h-4 overflow-hidden rounded px-[5px] py-px text-[10px] font-bold whitespace-nowrap text-white"
                      style={{ background: entryColor(e) }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {entries.length > 3 && <div className="form-hint">+{entries.length - 3} 筆</div>}
                </div>
              </div>
            );
          })}
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
