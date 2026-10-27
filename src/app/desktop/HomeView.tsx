"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/ui";
import { CountdownCard } from "./CountdownCard";
import { TodoCard } from "./TodoCard";
import { addMonths, apiFetch, currentMonth, errorText, formatCurrency, monthCellsPadded, todayISO, WEEKDAYS } from "@/lib/client";
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

      <MonthRoster today={today} />
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

// 月班表每天上方要顯示的「行事曆行程」與「接案」：
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

// 底部月班表：每天格子上方是行事曆行程與接案，下方是預排班（班別），標題有本月合計
function MonthRoster({ today }: { today: string }) {
  const locks = useBusinessLocks();
  const [month, setMonth] = useState(currentMonth);
  // 範圍含前後補滿整週的相鄰月份日期（淡淡顯示在空白格）；統計只算這個月
  const cells = monthCellsPadded(month);
  const from = cells[0]?.date ?? `${month}-01`;
  const to = cells[cells.length - 1]?.date ?? `${month}-28`;
  const plan = usePlanRange(from, to);
  const extras = useRangeExtras(from, to, locks);
  const allPlan = plan.status === "ok" ? plan.entries : [];
  const entries = allPlan.filter((e) => e.date.startsWith(month));
  const totalMin = entries.reduce((sum, e) => sum + paidMinutes(e), 0);
  const totalPay = entries.reduce((sum, e) => sum + shiftPay(e), 0);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="mb-0">月班表　{month}</h3>
          {plan.status === "ok" && (
            <p className="form-hint mt-1">
              本月 {entries.length} 班 · {formatHours(totalMin)} 小時{totalPay > 0 ? ` · ${formatCurrency(totalPay)}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ‹ 上月
          </button>
          <MonthPicker value={month} onChange={setMonth} />
          <button className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, 1))}>
            下月 ›
          </button>
          <button className="btn btn-outline" onClick={() => setMonth(currentMonth())}>
            本月
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs font-bold text-muted">
            {w}
          </div>
        ))}
      </div>
      {plan.status === "loading" ? (
        <p className="empty-hint mt-1.5">載入中…</p>
      ) : plan.status === "error" ? (
        <p className="empty-hint mt-1.5">無法載入（{plan.message}）</p>
      ) : (
        <div className="mt-1 grid auto-rows-fr grid-cols-7 gap-1 sm:gap-1.5">
          {cells.map(({ date, outside }) => {
            const list = allPlan.filter((e) => e.date === date);
            const dayExtras = extras.get(date) ?? [];
            const dayMin = outside ? 0 : list.reduce((sum, e) => sum + paidMinutes(e), 0);
            return (
              <div
                key={date}
                className={`min-h-[84px] min-w-0 rounded-[10px] border px-1 py-1.5 sm:min-h-[132px] sm:px-2 sm:py-2 ${
                  outside ? "bg-[#FAFCFD] opacity-45" : "bg-white"
                } ${date === today ? "border-2 border-navy-2" : "border-line"}`}
              >
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className={`text-[13px] font-bold ${outside ? "font-normal text-muted" : ""}`}>
                    {outside && date.slice(8) === "01" ? `${parseInt(date.slice(5, 7), 10)}/` : ""}
                    {parseInt(date.slice(8), 10)}
                  </span>
                  {dayMin > 0 && <span className="text-[11px] text-muted">{formatHours(dayMin)}h</span>}
                </div>
                {dayExtras.map((x) => (
                  <div
                    key={x.key}
                    className="mb-1 flex items-center gap-1.5 text-[11px] leading-4 sm:text-[12px]"
                    title={`${x.label}${x.sub ? ` ${x.sub}` : ""}`}
                  >
                    {x.kind === "biz" ? (
                      <span className="badge badge-gold flex-none px-1 py-0 text-[10px]">{x.tag}</span>
                    ) : (
                      <span className="inline-block size-2 flex-none rounded-full" style={{ background: x.color || "#0B3D5C" }} />
                    )}
                    <span className="min-w-0 truncate">{x.label}</span>
                  </div>
                ))}
                {dayExtras.length > 0 && list.length > 0 && <div className="my-1.5 border-t border-line" />}
                {list.map((e) => (
                  <div
                    key={e.id}
                    className="mb-1 rounded-md px-1.5 py-1 text-white"
                    style={{ background: colorOf(plan.templates, e.name) }}
                    title={`${e.name} ${e.start}–${e.end}`}
                  >
                    <div className="truncate text-[11px] leading-4 font-bold sm:text-[12px]">{e.name}</div>
                    <div className="hidden text-[10.5px] leading-3 opacity-90 sm:block">
                      {e.start}–{e.end}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <p className="form-hint mt-3">
        每格上方是行事曆行程（含拍攝賽事、夜班）、倒數日與接案（拍攝／報價／合約日期，金色標籤），下方是預排班（彩色班別）；要排班請到預排班頁。
      </p>
    </div>
  );
}
