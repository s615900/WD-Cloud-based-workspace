"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { CountdownCard } from "./CountdownCard";
import { TodoCard } from "./TodoCard";
import { addDays, addMonths, apiFetch, errorText, formatCurrency, todayISO, weekdayOf, WEEKDAYS } from "@/lib/client";
import { formatHours, paidMinutes, shiftPay } from "@/lib/payroll";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import { PLAN_EXCLUDED_TEMPLATES } from "@/lib/plan";
import type {
  ContractSummary,
  PlanEntry,
  ProjectItem,
  QuoteSummary,
  RosterEntry,
  RosterTemplate,
  ScheduleItem,
} from "@/lib/types";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }).format(new Date()),
  );
  return hour < 5 ? "夜深了" : hour < 12 ? "早安" : hour < 18 ? "午安" : "晚安";
}

function SummaryCard({
  title,
  href,
  linkLabel,
  state,
  empty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  state: Load<unknown[]>;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="mb-0">{title}</h3>
        <Link href={href} className="text-[13px] font-semibold text-navy-2 no-underline">
          {linkLabel} ›
        </Link>
      </div>
      {state.status === "loading" ? (
        <p className="empty-hint">載入中…</p>
      ) : state.status === "error" ? (
        <p className="empty-hint">無法載入（{state.message}）</p>
      ) : state.data.length === 0 ? (
        <p className="empty-hint">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

export function HomeView() {
  const today = todayISO();
  const [schedule, setSchedule] = useState<Load<ScheduleItem[]>>({ status: "loading" });
  const todayPlan = usePlanRange(today, today);

  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${today}T00:00:00+08:00`));

  // 近三日行程：月底時一併查下個月
  useEffect(() => {
    (async () => {
      try {
        const now = todayISO();
        const month = now.slice(0, 7);
        let items = await apiFetch<ScheduleItem[]>(`/api/schedule?month=${month}`);
        if (now.slice(8, 10) >= "28") {
          items = items.concat(await apiFetch<ScheduleItem[]>(`/api/schedule?month=${addMonths(month, 1)}`));
        }
        const cutoff = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
          new Date(new Date(`${now}T00:00:00+08:00`).getTime() + 3 * 86400000),
        );
        setSchedule({ status: "ok", data: items.filter((i) => i.date >= now && i.date <= cutoff).slice(0, 6) });
      } catch (err) {
        setSchedule({ status: "error", message: errorText(err) });
      }
    })();
  }, []);

  const rowClass = "flex justify-between border-b border-line py-2";

  return (
    <>
      {/* 問候語依當下時間計算，伺服器預先渲染跟瀏覽器可能差幾秒，允許文字不一致 */}
      <PageHeader
        title={<span suppressHydrationWarning>{greeting()}，WD</span>}
        subtitle={<span suppressHydrationWarning>{todayLabel}</span>}
      />

      <div className="mb-7 grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="近三日行程" href="/desktop/calendar" linkLabel="查看行事曆" state={schedule} empty="近三日沒有安排行程">
          {schedule.status === "ok" &&
            schedule.data.map((item) => (
              <div key={`${item.id}-${item.date}`} className="border-b border-line py-2">
                <span className="badge">
                  {item.date.slice(5)}
                  {item.time ? ` ${item.time}` : ""}
                </span>{" "}
                {item.title}
              </div>
            ))}
        </SummaryCard>

        <SummaryCard
          title="今日班表"
          href="/desktop/hr-finance?tab=plan"
          linkLabel="預排班"
          state={todayPlan.status === "ok" ? { status: "ok", data: todayPlan.entries } : todayPlan}
          empty="今天沒有排班"
        >
          {todayPlan.status === "ok" && (
            <>
              {todayPlan.entries.map((e) => (
                <div key={e.id} className={rowClass}>
                  <span>
                    <span
                      className="mr-1.5 inline-block size-[9px] rounded-[3px]"
                      style={{ background: colorOf(todayPlan.templates, e.name) }}
                    />
                    {e.name}
                  </span>
                  <span className="form-hint">
                    {e.start}–{e.end} · {formatHours(paidMinutes(e))} 小時
                  </span>
                </div>
              ))}
              <p className="form-hint mt-2">
                今日共 {formatHours(todayPlan.entries.reduce((sum, e) => sum + paidMinutes(e), 0))} 小時
              </p>
            </>
          )}
        </SummaryCard>

        <TodoCard />

        <CountdownCard limit={5} />

      </div>

      <WeekRoster today={today} />
    </>
  );
}

const PLAN_COLOR_FALLBACK = "#5A6570";
const colorOf = (templates: RosterTemplate[], name: string) =>
  templates.find((t) => t.name === name)?.color || PLAN_COLOR_FALLBACK;

type PlanRange =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; entries: PlanEntry[]; templates: RosterTemplate[] };

// 預排班資料（/api/plan）在 [from, to] 日期範圍內的班，跨月會查兩個月；同時抓班別模板用來上色
function usePlanRange(from: string, to: string): PlanRange {
  const [state, setState] = useState<{ key: string; result: PlanRange } | null>(null);
  const key = `${from}|${to}`;

  useEffect(() => {
    let alive = true;
    // from～to 之間每個月都要查（月曆補滿整週時，範圍可能橫跨上個月、這個月、下個月三個月）
    const months: string[] = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) months.push(m);
    Promise.all([
      Promise.all(months.map((m) => apiFetch<{ entries: PlanEntry[] }>(`/api/plan?month=${m}`))),
      apiFetch<RosterTemplate[]>("/api/roster/templates").catch(() => [] as RosterTemplate[]),
    ]).then(
      ([pages, templates]) => {
        const entries = pages
          .flatMap((p) => p.entries)
          .filter((e) => e.date >= from && e.date <= to)
          .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        if (alive) setState({ key, result: { status: "ok", entries, templates } });
      },
      (err) => {
        if (alive) setState({ key, result: { status: "error", message: errorText(err) } });
      },
    );
    return () => {
      alive = false;
    };
  }, [from, to, key]);

  return state && state.key === key ? state.result : { status: "loading" };
}

interface DayItem {
  key: string;
  label: string;
  sub: string;
  // event = 行事曆行程（深藍點）；biz = 接案（金色標籤）
  kind: "event" | "biz";
  color?: string;
  tag?: string;
}

const ymdOf = (v: string) => (v || "").replaceAll("/", "-").slice(0, 10);

// 週班表每天上方要顯示的「行事曆行程」與「接案」：
// 行程＝行事曆的個人行程／客戶預約，以及只存在行事曆、不列入預排班的班別（拍攝賽事、夜班）；
// 預排班已經排的班別不在這裡重複顯示。接案＝專案拍攝日、報價日期、合約日期（遵守各模組鎖定）。
function useRangeExtras(from: string, to: string, locks: ReturnType<typeof useBusinessLocks>): Map<string, DayItem[]> {
  const [events, setEvents] = useState<{ key: string; items: RosterEntry[] } | null>(null);
  const [biz, setBiz] = useState<{ date: string; item: DayItem }[]>([]);
  // 倒數日（每年重複的會落在今年的日期，所以另外抓，不靠行程原本的日期）
  const [countdowns, setCountdowns] = useState<{ id: number; title: string; date: string; originalDate: string; daysLeft: number }[]>([]);
  const key = `${from}|${to}`;

  useEffect(() => {
    let alive = true;
    apiFetch<typeof countdowns>("/api/countdowns").then(
      (list) => alive && setCountdowns(list),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch<RosterEntry[]>(`/api/roster/schedule?from=${from}&to=${to}`).then(
      (items) => alive && setEvents({ key, items }),
      () => alive && setEvents({ key, items: [] }),
    );
    return () => {
      alive = false;
    };
  }, [from, to, key]);

  useEffect(() => {
    if (!locks) return;
    let alive = true;
    const collected: { date: string; item: DayItem }[] = [];
    const add = (date: string, item: DayItem) => date && collected.push({ date: ymdOf(date), item });
    // 單一來源失敗就忽略，其他來源照常顯示
    Promise.all([
      locks.projects
        ? null
        : apiFetch<ProjectItem[]>("/api/projects")
            .then((list) =>
              list.forEach((p) =>
                add(p.shootDate, {
                  key: `p${p.id}`,
                  tag: "拍攝",
                  kind: "biz",
                  label: p.clientName || p.projectCode || `專案 #${p.id}`,
                  sub: p.projectType,
                }),
              ),
            )
            .catch(() => {}),
      locks.quotes
        ? null
        : apiFetch<QuoteSummary[]>("/api/quotes")
            .then((list) =>
              list.forEach((q) =>
                add(q.quoteDate, { key: `q${q.id}`, tag: "報價", kind: "biz", label: q.clientName || `客戶 #${q.clientId}`, sub: "" }),
              ),
            )
            .catch(() => {}),
      locks.contracts
        ? null
        : apiFetch<ContractSummary[]>("/api/contracts")
            .then((list) =>
              list.forEach((c) => add(c.quoteDate, { key: `c${c.id}`, tag: "合約", kind: "biz", label: c.clientName || "—", sub: "" })),
            )
            .catch(() => {}),
    ]).then(() => alive && setBiz(collected));
    return () => {
      alive = false;
    };
  }, [locks]);

  const map = new Map<string, DayItem[]>();
  const push = (date: string, item: DayItem) => map.set(date, [...(map.get(date) ?? []), item]);
  if (events && events.key === key) {
    for (const e of events.items) {
      if (e.status === "取消") continue;
      if (e.kind === "班別" && !PLAN_EXCLUDED_TEMPLATES.has(e.title)) continue;
      if (e.countdown) {
        // 倒數日：金色「倒數」標籤，跟一般行程的圓點區分
        push(e.date, { key: `e${e.id}`, tag: "倒數", kind: "biz", label: e.title.split("\n")[0] ?? e.title, sub: "" });
        continue;
      }
      push(e.date, {
        key: `e${e.id}`,
        kind: "event",
        label: e.title.split("\n")[0] ?? e.title,
        sub: e.allDay ? "全天" : `${e.start}–${e.end}`,
        color: e.color,
      });
    }
  }
  // 每年重複的倒數日：行程原本的日期不在這個月時，把今年（下一次）的日期補上
  for (const c of countdowns) {
    if (c.date < from || c.date > to || c.date === c.originalDate) continue;
    push(c.date, { key: `cd${c.id}`, tag: "倒數", kind: "biz", label: c.title, sub: c.daysLeft === 0 ? "今天" : `還有 ${c.daysLeft} 天` });
  }
  for (const { date, item } of biz) if (date >= from && date <= to) push(date, item);
  return map;
}

// 底部週班表（直式）：一天一列由上到下排，每列上方是行事曆行程與接案，下方是預排班（班別），標題有本週合計
function WeekRoster({ today }: { today: string }) {
  const locks = useBusinessLocks();
  const [weekStart, setWeekStart] = useState(() => addDays(today, -weekdayOf(today)));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = weekStart;
  const to = days[6]!;
  const plan = usePlanRange(from, to);
  const extras = useRangeExtras(from, to, locks);
  const entries = plan.status === "ok" ? plan.entries : [];
  const totalMin = entries.reduce((sum, e) => sum + paidMinutes(e), 0);
  const totalPay = entries.reduce((sum, e) => sum + shiftPay(e), 0);
  const md = (d: string) => `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8), 10)}`;
  const thisWeek = addDays(today, -weekdayOf(today));

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="mb-0">
            週班表　{md(from)}–{md(to)}
          </h3>
          {plan.status === "ok" && (
            <p className="form-hint mt-1">
              本週 {entries.length} 班 · {formatHours(totalMin)} 小時{totalPay > 0 ? ` · ${formatCurrency(totalPay)}` : ""}
            </p>
          )}
        </div>
        <div className="nav-compact flex flex-wrap items-center gap-2.5">
          <button className="btn btn-outline" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            ‹ 上週
          </button>
          <button className="btn btn-outline" onClick={() => setWeekStart(thisWeek)} disabled={weekStart === thisWeek}>
            本週
          </button>
          <button className="btn btn-outline" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            下週 ›
          </button>
        </div>
      </div>
      {plan.status === "loading" ? (
        <p className="empty-hint mt-1.5">載入中…</p>
      ) : plan.status === "error" ? (
        <p className="empty-hint mt-1.5">無法載入（{plan.message}）</p>
      ) : (
        <div className="space-y-2">
          {days.map((date) => {
            const list = entries.filter((e) => e.date === date);
            const dayExtras = extras.get(date) ?? [];
            const dayMin = list.reduce((sum, e) => sum + paidMinutes(e), 0);
            const isToday = date === today;
            return (
              <div
                key={date}
                className={`flex gap-3 rounded-xl border px-3 py-2.5 ${isToday ? "border-2 border-navy-2 bg-white" : "border-line bg-white"}`}
              >
                <div
                  className={`flex size-12 flex-none flex-col items-center justify-center rounded-xl leading-none ${
                    isToday ? "bg-gold text-white" : "bg-navy-soft text-navy"
                  }`}
                >
                  <span className="text-[18px] font-bold">{parseInt(date.slice(8), 10)}</span>
                  <span className="mt-1 text-[11px] font-semibold opacity-80">週{WEEKDAYS[weekdayOf(date)]}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {dayExtras.length === 0 && list.length === 0 && <div className="py-3 text-[13px] text-muted">沒有安排</div>}
                  {dayExtras.map((x) => (
                    <div key={x.key} className="flex items-center gap-2 text-[14px] leading-5">
                      {x.kind === "biz" ? (
                        <span className="badge badge-gold flex-none px-1.5 py-0 text-[11px]">{x.tag}</span>
                      ) : (
                        <span className="inline-block size-2.5 flex-none rounded-full" style={{ background: x.color || "#0B3D5C" }} />
                      )}
                      <span className="min-w-0 break-words font-semibold">{x.label}</span>
                      {x.sub && <span className="flex-none text-[12px] text-muted">{x.sub}</span>}
                    </div>
                  ))}
                  {list.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-white"
                      style={{ background: colorOf(plan.templates, e.name) }}
                    >
                      <span className="min-w-0 break-words text-[14px] font-bold">{e.name}</span>
                      <span className="flex-none text-[12px] opacity-90">
                        {e.start}–{e.end}
                      </span>
                    </div>
                  ))}
                  {dayMin > 0 && <div className="text-right text-[12px] text-muted">{formatHours(dayMin)} 小時</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="form-hint mt-3">
        每天上方是行事曆行程（含拍攝賽事、夜班）、倒數日與接案（拍攝／報價／合約日期，金色標籤），下方是預排班（彩色班別）；要排班請到預排班頁。
      </p>
    </div>
  );
}
