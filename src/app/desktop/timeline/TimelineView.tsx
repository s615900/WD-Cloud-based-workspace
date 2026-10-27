"use client";

// 「時間線」頁：把所有跟日期、時間有關的資料彙整在同一條線上，按日期分組
// （已逾期／今天／明天／N 天後…／未排定）。來源：
//   行程（個人行程、客戶預約）、班別（預排班＋只存在行事曆的拍攝賽事／夜班）、待辦（到期日）、
//   倒數日、接案（專案拍攝日、報價日期、合約日期）、財務待付款（卡費／保費／貸款／定期／待確認）。
// 單一來源讀取失敗就略過，其他照常顯示；接案各模組遵守鎖定設定。
// 分頁：時間線／班表（當月預排班與班別，可選年月）／做完的；時間線上方的分類按鈕可以只看某一種。
// 待辦可以直接勾完成。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/ui";
import { addDays, addMonths, apiFetch, currentMonth, errorText, formatCurrency, monthCells, sendJson, todayISO, weekdayOf, WEEKDAYS } from "@/lib/client";
import { daysBetween } from "@/lib/countdown";
import { PLAN_EXCLUDED_TEMPLATES } from "@/lib/plan";
import { getBusinessLocks } from "@/lib/useBusinessLocks";
import type { ContractSummary, PlanEntry, ProjectItem, QuoteSummary, RosterEntry, RosterTemplate, TaskListItem } from "@/lib/types";

const RANGE_DAYS = 30;
const COUNTDOWN_DAYS = 60;

type Tab = "line" | "roster" | "done";
const TABS: { key: Tab; label: string }[] = [
  { key: "line", label: "時間線" },
  { key: "roster", label: "班表" },
  { key: "done", label: "做完的" },
];

type Kind = "行程" | "班別" | "待辦" | "倒數" | "接案" | "財務";
const KINDS: Kind[] = ["行程", "班別", "待辦", "倒數", "接案", "財務"];

// 每一類固定一個顏色：分類按鈕的圓點、標籤與月曆小色條都用它，一眼就能分辨
const KIND_COLOR: Record<Kind, string> = {
  行程: "#14567e",
  班別: "#2a9d8f",
  待辦: "#d8a54b",
  倒數: "#e07a5f",
  接案: "#7c5cbf",
  財務: "#0f766e",
};

type Item = {
  key: string;
  kind: Kind;
  tag?: string; // 小標籤（拍攝／報價／合約／卡費…）
  date: string; // yyyy-MM-dd；"" ＝未排定
  time: string; // 左欄文字
  sortTime: string;
  title: string;
  sub: string;
  amount?: number;
  color: string;
  pinned: boolean;
  todo?: TaskListItem;
};

const titleOf = (content: string) => {
  const lines = content.split("\n");
  const first = (lines[0] ?? "").replace(/^\s*(#{1,3}\s+|>\s?|[-*]\s+)/, "");
  return { title: first || content, sub: lines.slice(1).join(" ").trim() };
};

const ymd = (v: string) => (v || "").replaceAll("/", "-").slice(0, 10);

function dayLabel(date: string, today: string): string {
  if (date === "") return "未排定";
  const diff = daysBetween(today, date);
  if (diff < 0) return "已逾期";
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  return `${diff} 天後`;
}

type Data = {
  events: RosterEntry[];
  plan: PlanEntry[];
  templates: RosterTemplate[];
  todos: TaskListItem[];
  countdowns: { id: number; title: string; date: string; originalDate: string; yearly: boolean; daysLeft: number }[];
  projects: ProjectItem[];
  quotes: QuoteSummary[];
  contracts: ContractSummary[];
  dues: { date: string; kind: string; title: string; amount: number; daysLeft: number; detail?: string }[];
};

// 單一來源失敗就給空資料，不拖垮整頁
const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export function TimelineView() {
  const today = todayISO();
  const [tab, setTab] = useState<Tab>("line");
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<Kind | "全部">("全部");
  const [data, setData] = useState<Data | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const reload = useCallback(() => setTick((n) => n + 1), []);

  // 時間線／做完的：今天起 30 天；班表：目前選的月份
  const monthDays = monthCells(month).filter((d): d is string => d !== null);
  const monthTab = tab === "roster";
  const from = monthTab ? monthDays[0]! : today;
  const to = monthTab ? monthDays[monthDays.length - 1]! : addDays(today, RANGE_DAYS);

  useEffect(() => {
    let alive = true;
    (async () => {
      const locks = await getBusinessLocks();
      const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
      const [events, planPages, templates, todos, countdowns, projects, quotes, contracts, overview] = await Promise.all([
        safe(apiFetch<RosterEntry[]>(`/api/roster/schedule?from=${from}&to=${to}`), []),
        safe(Promise.all(months.map((m) => apiFetch<{ entries: PlanEntry[] }>(`/api/plan?month=${m}`))), []),
        safe(apiFetch<RosterTemplate[]>("/api/roster/templates"), []),
        safe(apiFetch<TaskListItem[]>("/api/tasks?type=備忘"), []),
        safe(apiFetch<Data["countdowns"]>("/api/countdowns"), []),
        locks.projects ? [] : safe(apiFetch<ProjectItem[]>("/api/projects"), []),
        locks.quotes ? [] : safe(apiFetch<QuoteSummary[]>("/api/quotes"), []),
        locks.contracts ? [] : safe(apiFetch<ContractSummary[]>("/api/contracts"), []),
        safe(apiFetch<{ dues: Data["dues"] }>("/api/finance/overview"), { dues: [] }),
      ]);
      if (alive) {
        setData({ events, plan: planPages.flatMap((p) => p.entries), templates, todos, countdowns, projects, quotes, contracts, dues: overview.dues });
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to, tick]);

  async function setDone(t: TaskListItem, done: boolean) {
    setError("");
    try {
      await sendJson(`/api/tasks/${t.id}`, "PATCH", { status: done ? "完成" : "準備中", source: "todo" });
      reload();
    } catch (err) {
      setError(errorText(err, "更改狀態失敗"));
    }
  }

  const items: Item[] = [];
  if (data) {
    const inRange = (d: string) => d >= from && d <= to;
    const colorOfTemplate = (name: string) => data.templates.find((t) => t.name === name)?.color || "#5A6570";

    for (const e of data.events) {
      if (e.status === "取消" || e.status === "完成") continue;
      const isShift = e.kind === "班別";
      // 預排班已經排的班別在下面用預排班顯示；只存在行事曆的班別（拍攝賽事、夜班）在這裡顯示
      if (isShift && !PLAN_EXCLUDED_TEMPLATES.has(e.title)) continue;
      items.push({
        key: `e${e.id}`,
        kind: isShift ? "班別" : e.countdown ? "倒數" : "行程",
        tag: e.countdown ? "倒數" : undefined,
        date: e.date,
        time: e.allDay ? "整天" : `${e.start}–${e.end}`,
        sortTime: e.allDay ? "00:00" : e.start,
        title: e.title.split("\n")[0] ?? e.title,
        sub: "",
        color: e.color || "#0B3D5C",
        pinned: false,
      });
    }

    for (const p of data.plan) {
      if (!inRange(p.date)) continue;
      items.push({
        key: `p${p.id}`,
        kind: "班別",
        date: p.date,
        time: `${p.start}–${p.end}`,
        sortTime: p.start,
        title: p.name,
        sub: p.double ? "雙倍" : "",
        color: colorOfTemplate(p.name),
        pinned: false,
      });
    }

    for (const t of data.todos) {
      if (t.status === "完成" || t.status === "取消") continue;
      if (monthTab && !(t.dueDate && inRange(t.dueDate))) continue; // 月曆／班表只放有到期日、落在這個月的待辦
      const { title, sub } = titleOf(t.content);
      items.push({ key: `t${t.id}`, kind: "待辦", date: t.dueDate ?? "", time: "", sortTime: "99:99", title, sub, color: "#B8860B", pinned: t.pinned ?? false, todo: t });
    }

    // 倒數日：每年重複的用下一次的日期；行程本身（沒勾每年重複）已經在上面以「倒數」類型顯示，這裡只補每年重複落在別年的
    for (const c of data.countdowns) {
      if (c.date === c.originalDate || (monthTab ? !inRange(c.date) : c.daysLeft > COUNTDOWN_DAYS)) continue;
      items.push({
        key: `cd${c.id}`,
        kind: "倒數",
        tag: "倒數",
        date: c.date,
        time: "整天",
        sortTime: "00:00",
        title: c.title,
        sub: c.daysLeft === 0 ? "就是今天" : `還有 ${c.daysLeft} 天`,
        color: "#B8860B",
        pinned: false,
      });
    }

    for (const p of data.projects) {
      const d = ymd(p.shootDate);
      if (!inRange(d)) continue;
      items.push({ key: `pj${p.id}`, kind: "接案", tag: "拍攝", date: d, time: "", sortTime: "98:00", title: p.clientName || p.projectCode || `專案 #${p.id}`, sub: p.projectType, color: "#B8860B", pinned: false });
    }
    for (const q of data.quotes) {
      const d = ymd(q.quoteDate);
      if (!inRange(d)) continue;
      items.push({ key: `q${q.id}`, kind: "接案", tag: "報價", date: d, time: "", sortTime: "98:00", title: q.clientName || `客戶 #${q.clientId}`, sub: "", color: "#B8860B", pinned: false });
    }
    for (const c of data.contracts) {
      const d = ymd(c.quoteDate);
      if (!inRange(d)) continue;
      items.push({ key: `c${c.id}`, kind: "接案", tag: "合約", date: d, time: "", sortTime: "98:00", title: c.clientName || "—", sub: "", color: "#B8860B", pinned: false });
    }

    for (const d of data.dues) {
      if (monthTab && !inRange(d.date)) continue;
      items.push({
        key: `f${d.kind}${d.date}${d.title}`,
        kind: "財務",
        tag: d.kind,
        date: d.date,
        time: "",
        sortTime: "97:00",
        title: d.title,
        sub: d.detail ?? "",
        amount: d.amount,
        color: d.daysLeft < 0 ? "#b91c1c" : "#0f766e",
        pinned: false,
      });
    }
  }

  // 班表分頁只看班別；其他分頁套用上方分類按鈕
  const shown = items.filter((it) => (tab === "roster" ? it.kind === "班別" : filter === "全部" || it.kind === filter));
  const counts = new Map<Kind, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);

  // 日期群組：時間線把已逾期（日期已過還沒做的）合成一組放最前面，未排定放最後；月曆／班表只有這個月的日期
  const groups = new Map<string, Item[]>();
  for (const it of shown) {
    const key = it.date === "" ? "" : it.date < today && tab === "line" ? "overdue" : it.date;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const order = [...groups.keys()].sort((a, b) => (a === "overdue" ? -1 : b === "overdue" ? 1 : a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const sortItems = (list: Item[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortTime.localeCompare(b.sortTime));

  const doneTodos = data?.todos.filter((t) => t.status === "完成") ?? [];

  // 時間線最上面的小統計（只有時間線分頁、載入完才顯示）
  const stats = {
    today: items.filter((it) => it.date === today).length,
    week: items.filter((it) => it.date >= today && it.date <= addDays(today, 6)).length,
    overdue: items.filter((it) => it.date !== "" && it.date < today && it.kind !== "班別").length,
    todos: items.filter((it) => it.kind === "待辦").length,
  };

  function renderGroup(key: string) {
    const list = sortItems(groups.get(key) ?? []);
    const date = key === "overdue" || key === "" ? "" : key;
    const isToday = key === today;
    const overdue = key === "overdue";
    return (
      <div key={key || "none"} className="mb-6 last:mb-0">
        <div className="mb-2.5 flex items-center gap-3">
          <div
            className={`flex size-11 flex-none flex-col items-center justify-center rounded-xl leading-none ${
              isToday ? "bg-gold text-white" : overdue ? "bg-danger-soft text-danger" : "bg-navy-soft text-navy"
            }`}
          >
            {date ? (
              <>
                <span className="text-[17px] font-bold">{Number(date.slice(8))}</span>
                <span className="mt-0.5 text-[10px] font-semibold opacity-80">週{WEEKDAYS[weekdayOf(date)]}</span>
              </>
            ) : (
              <span className="text-[18px]">{overdue ? "!" : "…"}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[16px] font-bold ${isToday ? "text-gold-dark" : overdue ? "text-danger" : "text-navy"}`}>
              {overdue ? "已逾期" : dayLabel(date, today)}
            </div>
            {date && <div className="text-xs text-muted">{date.slice(0, 4)}/{date.slice(5).replace("-", "/")}</div>}
          </div>
          <span className="flex-none rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-muted">{list.length} 件</span>
        </div>

        <div className="ml-[21px] space-y-2 border-l-2 border-line pl-5">
          {list.map((it) => (
            <div
              key={it.key}
              className="flex items-center gap-3 rounded-xl border border-line bg-white py-2.5 pr-3.5 pl-3 shadow-[0_1px_2px_rgba(11,61,92,0.04)] transition hover:shadow-card"
              style={{ borderLeft: `4px solid ${it.color}` }}
            >
              {(it.kind === "待辦" || it.time) && (
              <div className="flex-none sm:w-[112px]">
                {it.kind === "待辦" ? (
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => it.todo && void setDone(it.todo, true)}
                    aria-label="標成完成"
                    className="size-5 cursor-pointer accent-[#0b3d5c]"
                  />
                ) : it.time ? (
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${isToday ? "bg-gold-soft text-gold-dark" : "bg-navy-soft text-navy"}`}>
                    {it.time}
                  </span>
                ) : null}
              </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="break-words text-[15px] font-semibold sm:truncate">{it.title}</span>
                  {it.tag && (
                    <span className="flex-none rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: `${KIND_COLOR[it.kind]}1f`, color: KIND_COLOR[it.kind] }}>
                      {it.tag}
                    </span>
                  )}
                  {it.todo?.dueDate && overdue && <span className="flex-none text-xs text-danger">到期 {it.todo.dueDate.slice(5).replace("-", "/")}</span>}
                </div>
                {it.sub && <div className="mt-0.5 truncate text-xs text-muted">{it.sub}</div>}
              </div>
              {it.amount !== undefined && <span className="flex-none text-[15px] font-bold text-navy">{formatCurrency(it.amount)}</span>}
              {it.pinned && <span className="flex-none text-[18px] text-gold" title="已釘選">★</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const monthNav = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, -1))}>
        ‹ 上月
      </button>
      <MonthPicker value={month} onChange={setMonth} />
      <button type="button" className="btn btn-outline" onClick={() => setMonth((m) => addMonths(m, 1))}>
        下月 ›
      </button>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setMonth(currentMonth())}
      >
        本月
      </button>
    </div>
  );

  const empty = (icon: string, text: string) => (
    <div className="py-10 text-center">
      <div className="mb-2 text-[32px]">{icon}</div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        title="時間線"
        subtitle="所有跟日期、時間有關的事，排在同一條線上。"
        actions={
          <>
            <Link href="/desktop/calendar" className="btn btn-outline no-underline">
              + 加行程
            </Link>
            <Link href="/desktop/tasks" className="btn btn-gold no-underline">
              + 加待辦
            </Link>
          </>
        }
      />

      {/* 分頁：膠囊式切換 */}
      <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-[9px] border-0 px-4 py-1.5 text-sm font-bold transition ${
              tab === t.key ? "bg-navy text-white shadow-sm" : "bg-transparent text-muted hover:text-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "line" && data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "今天", value: stats.today, color: "text-gold-dark" },
            { label: "這 7 天", value: stats.week, color: "text-navy" },
            { label: "已逾期", value: stats.overdue, color: stats.overdue > 0 ? "text-danger" : "text-muted" },
            { label: "未完成待辦", value: stats.todos, color: "text-navy" },
          ].map((x) => (
            <div key={x.label} className="rounded-xl bg-white px-4 py-3 shadow-card">
              <div className="text-xs font-semibold text-muted">{x.label}</div>
              <div className={`mt-0.5 text-[26px] leading-tight font-bold ${x.color}`}>{x.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "line" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["全部", ...KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 px-3.5 py-1 text-[13px] font-bold transition ${
                filter === k ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:border-navy-2"
              }`}
            >
              {k !== "全部" && <span className="size-2 rounded-full" style={{ background: KIND_COLOR[k] }} />}
              {k}
              {k !== "全部" && counts.get(k) ? <span className="opacity-70">{counts.get(k)}</span> : null}
            </button>
          ))}
          <Link
            href="/desktop/hr-finance?tab=plan"
            className="inline-flex items-center rounded-full border-2 border-dashed border-line px-3.5 py-1 text-[13px] font-bold text-muted no-underline hover:border-navy-2 hover:text-navy"
            title="新增、修改班別模板（名稱、時間、時薪）"
          >
            管理班別
          </Link>
        </div>
      )}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      {monthTab && monthNav}

      <section className="card">
        {!data ? (
          <p className="py-8 text-center text-sm text-muted">載入中…</p>
        ) : tab === "done" ? (
          doneTodos.length === 0 ? (
            empty("✅", "還沒有做完的待辦")
          ) : (
            <div className="space-y-2">
              {doneTodos.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-subtle px-3.5 py-2.5">
                  <input type="checkbox" checked onChange={() => void setDone(t, false)} aria-label="還原為未完成" className="size-5 cursor-pointer accent-[#0b3d5c]" />
                  <span className="min-w-0 truncate text-muted line-through">{titleOf(t.content).title}</span>
                </div>
              ))}
            </div>
          )
        ) : tab === "roster" ? (
          order.length === 0 ? (
            empty("🕘", `${month} 還沒有排班`)
          ) : (
            <>
              <p className="mb-4 rounded-xl bg-subtle px-3.5 py-2 text-sm text-muted">
                {month} 共 <b className="text-navy">{shown.length}</b> 班　·　要排班、看工時與薪資請到{" "}
                <Link href="/desktop/hr-finance?tab=plan" className="font-semibold text-navy-2">
                  預排班
                </Link>
              </p>
              {order.map(renderGroup)}
            </>
          )
        ) : order.length === 0 ? (
          empty("🎉", "這個分類接下來沒有東西")
        ) : (
          order.map(renderGroup)
        )}
      </section>
      <p className="form-hint mt-3">
        {monthTab
          ? `只顯示 ${month} 的班別（預排班加上拍攝賽事、夜班）。`
          : `顯示今天起 ${RANGE_DAYS} 天內的行程、班別、接案日期與財務待付款，加上所有未完成的待辦與近期倒數日。`}
      </p>
    </>
  );
}
