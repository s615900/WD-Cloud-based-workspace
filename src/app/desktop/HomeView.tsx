"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { addMonths, apiFetch, currentMonth, errorText, monthCells, todayISO, WEEKDAYS } from "@/lib/client";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import { displayContractStatus } from "@/lib/contractStatus";
import type { ContractSummary, ProjectItem, QuoteSummary, ScheduleItem } from "@/lib/types";

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
  const [projects, setProjects] = useState<Load<ProjectItem[]>>({ status: "loading" });

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
    if (!locks.projects) {
      apiFetch<ProjectItem[]>("/api/projects").then(
        (data) => setProjects({ status: "ok", data: data.slice(0, 3) }),
        (err) => setProjects({ status: "error", message: errorText(err) }),
      );
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

        {locks && !locks.projects && (
          <SummaryCard title="專案進度" href="/desktop/projects" linkLabel="查看全部" state={projects} empty="尚無專案">
            {projects.status === "ok" &&
              projects.data.map((p) => (
                <div key={p.id} className={rowClass}>
                  <span>{p.clientName || p.projectCode || `專案 #${p.id}`}</span>
                  <span className="badge badge-teal">{p.status}</span>
                </div>
              ))}
          </SummaryCard>
        )}

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

      {locks && <MiniCalendar today={today} quotesLocked={!!locks.quotes} contractsLocked={!!locks.contracts} />}
    </>
  );
}

// 底部行事曆月檢視：私人行程（深藍點）＋接案商業（報價／合約日期，金色點）
function MiniCalendar({
  today,
  quotesLocked,
  contractsLocked,
}: {
  today: string;
  quotesLocked: boolean;
  contractsLocked: boolean;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [dots, setDots] = useState<{ month: string; privateDates: Set<string>; businessDates: Set<string> } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const privateDates = new Set<string>();
      const businessDates = new Set<string>();
      // 單一來源失敗就忽略，其他來源仍照常顯示
      await Promise.all([
        apiFetch<ScheduleItem[]>(`/api/schedule?month=${month}`)
          .then((items) => items.forEach((s) => privateDates.add(s.date)))
          .catch(() => {}),
        quotesLocked
          ? null
          : apiFetch<QuoteSummary[]>("/api/quotes")
              .then((items) => items.forEach((q) => businessDates.add((q.quoteDate || "").replaceAll("/", "-"))))
              .catch(() => {}),
        contractsLocked
          ? null
          : apiFetch<ContractSummary[]>("/api/contracts")
              .then((items) => items.forEach((c) => businessDates.add((c.quoteDate || "").replaceAll("/", "-"))))
              .catch(() => {}),
      ]);
      if (alive) setDots({ month, privateDates, businessDates });
    })();
    return () => {
      alive = false;
    };
  }, [month, quotesLocked, contractsLocked]);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0">行事曆　{month}</h3>
        <div className="flex gap-2.5">
          <button className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ‹ 上月
          </button>
          <button className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, 1))}>
            下月 ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1.5 text-center text-xs font-bold text-muted">
            {w}
          </div>
        ))}
      </div>
      {!dots || dots.month !== month ? (
        <p className="empty-hint mt-1.5">載入中…</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {monthCells(month).map((date, i) =>
            date ? (
              <div
                key={date}
                className={`min-h-[86px] rounded-[10px] border bg-white px-2 py-1.5 text-xs max-sm:min-h-14 max-sm:p-1 ${
                  date === today ? "border-2 border-navy-2" : "border-line"
                }`}
              >
                <div className="mb-1 font-bold">{parseInt(date.slice(8), 10)}</div>
                <div className="flex flex-wrap gap-1">
                  {dots.privateDates.has(date) && <span className="inline-block size-[7px] rounded-full bg-navy" />}
                  {dots.businessDates.has(date) && <span className="inline-block size-[7px] rounded-full bg-gold" />}
                </div>
              </div>
            ) : (
              <div key={`pad-${i}`} className="min-h-[86px] rounded-[10px] border border-line opacity-35 max-sm:min-h-14" />
            ),
          )}
        </div>
      )}
      <p className="form-hint mt-3">
        <span className="mr-1 inline-block size-[7px] rounded-full bg-navy" />
        私人行程
        <span className="mr-1 ml-4 inline-block size-[7px] rounded-full bg-gold" />
        接案商業（報價／合約日期）
      </p>
    </div>
  );
}
