"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Message, PageHeader, type MessageState } from "@/components/ui";
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
import { NewTemplateModal, PublishModal, RepeatModal } from "./CalendarModals";

const startOfWeek = (ymd: string) => addDays(ymd, -weekdayOf(ymd));
const entryColor = (e: RosterEntry) => (e.status === "取消" ? "#B7C2CC" : e.color || "#5A6570");

type ConfigForm = Record<
  "dayStart" | "dayEnd" | "bufferBefore" | "bufferAfter" | "minSlot" | "roundTo" | "publishDays" | "bookingUrl",
  string
>;

export function CalendarView({ initialDate }: { initialDate: string | null }) {
  const [templates, setTemplates] = useState<RosterTemplate[] | null>(null);
  const [config, setConfig] = useState<RosterConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [view, setView] = useState<"month" | "week">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => (initialDate ? initialDate.slice(0, 7) : currentMonth()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate ?? todayISO()));
  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? todayISO());
  const [picked, setPicked] = useState<RosterTemplate | null>(null);
  // 排班資料或空檔規則變動時遞增，觸發行事曆與右側面板重新載入
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const [modal, setModal] = useState<
    { kind: "template" } | { kind: "repeat"; template: RosterTemplate } | { kind: "publish" } | null
  >(null);

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await apiFetch<RosterTemplate[]>("/api/roster/templates"));
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    apiFetch<RosterTemplate[]>("/api/roster/templates").then(setTemplates, () => setTemplates([]));
    apiFetch<RosterConfig>("/api/roster/config").then(setConfig, (err) => setConfigError(errorText(err)));
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
        subtitle="班別模板、重複排班、空檔推算與公布——跟 LINE Bot 行程資料共用同一張排班表"
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                // 開放預約：直接開啟設定裡的預約連結
                if (config?.bookingUrl) window.open(config.bookingUrl, "_blank", "noopener");
                else alert("尚未設定預約連結，請先在下方「空檔推算規則」填入預約連結。");
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

      {/* 班別模板 */}
      <section className="card mb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="mb-0">班別模板</h3>
          <span className="form-hint">點模板卡片後再點日曆上的日期，即可排入該天</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {templates === null ? (
            <p className="empty-hint">載入中…</p>
          ) : templates.length === 0 ? (
            <p className="empty-hint">還沒有班別模板</p>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setPicked((p) => (p?.id === t.id ? null : t))}
                className={`min-w-[150px] flex-none cursor-pointer rounded-[11px] border-[1.5px] bg-white px-3 py-2.5 text-left hover:border-navy ${
                  picked?.id === t.id ? "border-navy shadow-[0_0_0_3px_rgba(11,61,92,.12)]" : "border-line"
                }`}
              >
                <span className="mr-1.5 inline-block size-[9px] rounded-[3px]" style={{ background: t.color }} />
                <span className="text-[13px] font-bold">{t.name}</span>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {t.start} – {t.end}
                </div>
                <button
                  type="button"
                  className="mt-2 cursor-pointer rounded-md bg-page px-2 py-[3px] text-[10.5px] font-bold text-navy hover:bg-navy hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ kind: "repeat", template: t });
                  }}
                >
                  重複排班
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            className="flex min-w-[54px] flex-none cursor-pointer items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-line bg-white text-xl text-muted"
            onClick={() => setModal({ kind: "template" })}
          >
            ＋
          </button>
        </div>
        {picked && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[9px] bg-navy px-3 py-2 text-[13px] text-white">
            <span>
              正在排入 <b>{picked.name}</b>　點日曆上的日期即可排入
            </span>
            <button
              type="button"
              className="ml-auto cursor-pointer rounded-[7px] bg-white/16 px-2.5 py-1 text-xs"
              onClick={() => setPicked(null)}
            >
              取消
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[2fr_1fr]">
        <div className="min-w-0">
          <section className="card mb-5">
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

          {config ? (
            <ConfigSection
              config={config}
              onSaved={(c) => {
                setConfig(c);
                refresh();
              }}
            />
          ) : (
            <section className="card">
              <h3>空檔推算規則</h3>
              <p className="empty-hint">{configError ? `無法載入（${configError}）` : "載入中…"}</p>
            </section>
          )}
        </div>

        <DayPanel date={selectedDate} version={version} onChanged={refresh} />
      </div>

      {modal?.kind === "template" && (
        <NewTemplateModal
          templateCount={templates?.length ?? 0}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            loadTemplates();
          }}
        />
      )}
      {modal?.kind === "repeat" && (
        <RepeatModal
          template={modal.template}
          defaultFrom={selectedDate}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
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

function toForm(c: RosterConfig): ConfigForm {
  return {
    dayStart: c.dayStart,
    dayEnd: c.dayEnd,
    bufferBefore: String(c.bufferBefore),
    bufferAfter: String(c.bufferAfter),
    minSlot: String(c.minSlot),
    roundTo: String(c.roundTo),
    publishDays: String(c.publishDays),
    bookingUrl: c.bookingUrl,
  };
}

// 空檔推算規則：欄位變動後 0.5 秒自動儲存，儲存後重算右側空檔
function ConfigSection({ config, onSaved }: { config: RosterConfig; onSaved: (c: RosterConfig) => void }) {
  const [form, setForm] = useState<ConfigForm>(() => toForm(config));
  const [message, setMessage] = useState<MessageState>({ text: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function update(key: keyof ConfigForm, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = {
        dayStart: next.dayStart,
        dayEnd: next.dayEnd,
        bufferBefore: Number(next.bufferBefore),
        bufferAfter: Number(next.bufferAfter),
        minSlot: Number(next.minSlot),
        roundTo: Number(next.roundTo),
        publishDays: Number(next.publishDays),
        bookingUrl: next.bookingUrl,
      };
      setMessage({ text: "儲存中…" });
      try {
        await apiFetch("/api/roster/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setMessage({ text: "已儲存", kind: "success" });
        onSaved({ ...config, ...body });
      } catch (err) {
        setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      }
    }, 500);
  }

  const field = (key: keyof ConfigForm, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      className="input"
      value={form[key]}
      onChange={(e) => update(key, e.target.value)}
      {...props}
    />
  );

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0">空檔推算規則</h3>
        <span className="form-hint">修改後即時重算右側空檔</span>
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label>每日開始</label>
          {field("dayStart", { type: "time" })}
        </div>
        <div className="form-field">
          <label>每日結束</label>
          {field("dayEnd", { type: "time" })}
        </div>
        <div className="form-field">
          <label>班前緩衝（分）</label>
          {field("bufferBefore", { type: "number", min: 0, step: 15 })}
        </div>
        <div className="form-field">
          <label>班後緩衝（分）</label>
          {field("bufferAfter", { type: "number", min: 0, step: 15 })}
        </div>
        <div className="form-field">
          <label>最短可用空檔</label>
          <select className="input" value={form.minSlot} onChange={(e) => update("minSlot", e.target.value)}>
            <option value="30">30 分</option>
            <option value="60">1 小時</option>
            <option value="90">1.5 小時</option>
            <option value="120">2 小時</option>
            <option value="180">3 小時</option>
          </select>
        </div>
        <div className="form-field">
          <label>時間對齊</label>
          <select className="input" value={form.roundTo} onChange={(e) => update("roundTo", e.target.value)}>
            <option value="15">15 分</option>
            <option value="30">30 分</option>
            <option value="60">整點</option>
          </select>
        </div>
        <div className="form-field">
          <label>公布天數</label>
          {field("publishDays", { type: "number", min: 1, step: 1 })}
        </div>
        <div className="form-field sm:col-span-2">
          <label>預約連結（留空則公布訊息不附連結）</label>
          {field("bookingUrl", { type: "text", placeholder: "https://…" })}
        </div>
      </div>
      <Message state={message} />
    </section>
  );
}
