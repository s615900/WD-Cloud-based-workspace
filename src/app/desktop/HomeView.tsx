"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { addDays, addMonths, apiFetch, errorText, formatCurrency, todayISO, weekdayOf, WEEKDAYS } from "@/lib/client";
import { formatHours, paidMinutes, shiftPay } from "@/lib/payroll";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import { displayContractStatus } from "@/lib/contractStatus";
import type { ContractSummary, PlanEntry, QuoteSummary, RosterTemplate, ScheduleItem } from "@/lib/types";

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
  const locks = useBusinessLocks();
  const today = todayISO();
  const [schedule, setSchedule] = useState<Load<ScheduleItem[]>>({ status: "loading" });
  const [quotes, setQuotes] = useState<Load<QuoteSummary[]>>({ status: "loading" });
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
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

  // 報價單／合約／專案：各模組鎖定時不打對應 API
  useEffect(() => {
    if (!locks) return;
    if (!locks.quotes || !locks.contracts) {
      (async () => {
        try {
          setQuotes({ status: "ok", data: locks.quotes ? [] : await apiFetch<QuoteSummary[]>("/api/quotes") });
        } catch (err) {
          setQuotes({ status: "error", message: errorText(err) });
        }
        if (!locks.contracts) {
          // 合約若失敗不擋報價顯示
          apiFetch<ContractSummary[]>("/api/contracts").then(setContracts, () => setContracts([]));
        }
      })();
    }
  }, [locks]);

  const merged =
    quotes.status === "ok"
      ? [
          ...quotes.data.slice(0, 3).map((q) => ({
            kind: "報價",
            label: q.clientName || `客戶 #${q.clientId}`,
            sub: q.quoteDate,
            id: q.id,
          })),
          ...contracts.slice(0, 3).map((c) => ({ kind: "合約", label: c.clientName || "—", sub: displayContractStatus(c).label, id: c.id })),
        ]
          .sort((a, b) => b.id - a.id)
          .slice(0, 3)
      : [];

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
          href="/desktop/plan"
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

        {/* 報價單卡片同時顯示報價單／合約兩種資料，兩邊都鎖定才整張隱藏 */}
        {locks && !(locks.quotes && locks.contracts) && (
          <SummaryCard
            title="合約 / 報價"
            href="/desktop/quotes"
            linkLabel="查看全部"
            state={quotes.status === "ok" ? { status: "ok", data: merged } : quotes}
            empty="尚無報價或合約"
          >
            {merged.map((m) => (
              <div key={`${m.kind}-${m.id}`} className={rowClass}>
                <span>
                  <span className="badge badge-gold mr-1.5">{m.kind}</span>
                  {m.label}
                </span>
                <span className="form-hint">{m.sub}</span>
              </div>
            ))}
          </SummaryCard>
        )}
      </div>

      <WeekRoster today={today} />
    </>
  );
}

const PLAN_COLOR_FALLBACK = "#5A6570";
const colorOf = (templates: RosterTemplate[], name: string) =>
  templates.find((t) => t.name === name)?.color || PLAN_COLOR_FALLBACK;
const startOfWeek = (ymd: string) => addDays(ymd, -weekdayOf(ymd));

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
    const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
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

// 底部週班表：7 天的預排班（班別、時間、工時）＋本週合計
function WeekRoster({ today }: { today: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const weekEnd = addDays(weekStart, 6);
  const plan = usePlanRange(weekStart, weekEnd);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const entries = plan.status === "ok" ? plan.entries : [];
  const totalMin = entries.reduce((sum, e) => sum + paidMinutes(e), 0);
  const totalPay = entries.reduce((sum, e) => sum + shiftPay(e), 0);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="mb-0">
            週班表　{weekStart.slice(5).replace("-", "/")} ～ {weekEnd.slice(5).replace("-", "/")}
          </h3>
          {plan.status === "ok" && (
            <p className="form-hint mt-1">
              本週 {entries.length} 班 · {formatHours(totalMin)} 小時{totalPay > 0 ? ` · ${formatCurrency(totalPay)}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2.5">
          <button className="btn btn-outline" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            ‹ 上週
          </button>
          <button className="btn btn-outline" onClick={() => setWeekStart(startOfWeek(today))}>
            本週
          </button>
          <button className="btn btn-outline" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            下週 ›
          </button>
        </div>
      </div>
      {plan.status === "loading" ? (
        <p className="empty-hint">載入中…</p>
      ) : plan.status === "error" ? (
        <p className="empty-hint">無法載入（{plan.message}）</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {dates.map((date) => {
            const list = entries.filter((e) => e.date === date);
            const dayMin = list.reduce((sum, e) => sum + paidMinutes(e), 0);
            return (
              <div
                key={date}
                className={`min-w-0 rounded-[10px] border bg-white p-2 md:min-h-32 ${
                  date === today ? "border-2 border-navy-2" : "border-line"
                }`}
              >
                <div className="mb-1.5 flex items-baseline justify-between text-xs font-bold">
                  <span>
                    {date.slice(5).replace("-", "/")}（{WEEKDAYS[weekdayOf(date)]}）
                  </span>
                  {dayMin > 0 && <span className="font-normal text-muted">{formatHours(dayMin)}h</span>}
                </div>
                {list.length === 0 ? (
                  <p className="form-hint">休</p>
                ) : (
                  list.map((e) => (
                    <div
                      key={e.id}
                      className="mb-1 rounded border-l-[3px] bg-page px-1.5 py-[3px] text-[11.5px]"
                      style={{ borderLeftColor: colorOf(plan.templates, e.name) }}
                    >
                      <div className="font-bold">{e.name}</div>
                      <div className="text-muted">
                        {e.start}–{e.end}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="form-hint mt-3">資料來自「預排班」，要排班或調整請到預排班頁。</p>
    </div>
  );
}
