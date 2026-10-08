"use client";

// 人事假勤：員工名冊、請假紀錄、法規對照三個分頁。
// 特休／事假／病假的計算全部在 src/lib/leave.ts（有單元測試），這裡只負責畫面。
import { useEffect, useState } from "react";
import { EmptyRow, Message, Modal, ModalActions, PageHeader, SearchBox, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson, todayISO } from "@/lib/client";
import {
  HOURS_PER_DAY,
  LEAVE_TYPES,
  addDaysYMD,
  annualPeriod,
  annualUsedHours,
  daysBetween,
  formatHours,
  hoursToDays,
  leaveTypeInfo,
  seniorityText,
  yearStats,
} from "@/lib/leave";
import type { EmployeeItem, LeaveItem } from "@/lib/types";

type Tab = "roster" | "leaves" | "law";
type Load =
  | { status: "loading" }
  | { status: "notConfigured" }
  | { status: "error"; message: string }
  | { status: "ok"; employees: EmployeeItem[]; leaves: LeaveItem[] };

const TABS: { key: Tab; label: string }[] = [
  { key: "roster", label: "員工名冊" },
  { key: "leaves", label: "請假紀錄" },
  { key: "law", label: "法規對照" },
];

function sortEmployees(list: EmployeeItem[]): EmployeeItem[] {
  return [...list].sort((a, b) => (a.empNo || a.name).localeCompare(b.empNo || b.name, "zh-Hant"));
}

export function HrView() {
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [tab, setTab] = useState<Tab>("roster");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);
  const [year, setYear] = useState(thisYear);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EmployeeItem | "new" | null>(null);
  const [leaveFor, setLeaveFor] = useState<number | "pick" | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<EmployeeItem[]>("/api/hr/employees"), apiFetch<LeaveItem[]>("/api/hr/leaves")]).then(
      ([employees, leaves]) => setLoad({ status: "ok", employees, leaves }),
      (err) => {
        const message = errorText(err);
        setLoad(message.includes("尚未設定") ? { status: "notConfigured" } : { status: "error", message });
      },
    );
  }, [reloadCount]);

  const reload = () => setReloadCount((n) => n + 1);
  const employees = load.status === "ok" ? load.employees : [];
  const leaves = load.status === "ok" ? load.leaves : [];
  const detail = employees.find((e) => e.id === detailId) ?? null;

  const yearSet = new Set<number>([thisYear, thisYear - 1, thisYear + 1]);
  for (const l of leaves) yearSet.add(Number(l.date.slice(0, 4)));
  const years = [...yearSet].filter(Boolean).sort((a, b) => b - a);

  const ready = load.status === "ok";

  return (
    <>
      <PageHeader
        title="人事假勤"
        subtitle="依勞動基準法第 38 條與勞工請假規則（115 年 1 月 1 日修正施行）計算"
        actions={
          ready ? (
            <>
              <button className="btn btn-outline" onClick={() => setLeaveFor("pick")} disabled={employees.length === 0}>
                + 新增請假
              </button>
              <button className="btn btn-gold" onClick={() => setEditing("new")}>
                + 新增員工
              </button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "law" ? (
        <LawPanel />
      ) : load.status === "notConfigured" ? (
        <SetupNotice />
      ) : tab === "roster" ? (
        <RosterPanel
          load={load}
          today={today}
          year={year}
          years={years}
          onYear={setYear}
          onOpen={(e) => setDetailId(e.id)}
        />
      ) : (
        <LeavesPanel load={load} years={years} defaultYear={year} onChanged={reload} onOpen={(id) => setDetailId(id)} />
      )}

      {detail && (
        <EmployeeDetailModal
          employee={detail}
          leaves={leaves}
          today={today}
          year={year}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
          onLeave={() => setLeaveFor(detail.id)}
          onDeleted={() => {
            setDetailId(null);
            reload();
          }}
        />
      )}

      {editing && (
        <EmployeeFormModal
          employee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setDetailId(id);
            reload();
          }}
        />
      )}

      {leaveFor !== null && (
        <LeaveFormModal
          employees={sortEmployees(employees)}
          leaves={leaves}
          initialEmployeeId={leaveFor === "pick" ? null : leaveFor}
          onClose={() => setLeaveFor(null)}
          onSaved={() => {
            setLeaveFor(null);
            reload();
          }}
        />
      )}
    </>
  );
}

// ── 員工名冊 ─────────────────────────────────────────────────────

function Meter({ usedHours, quotaDays, warnDays }: { usedHours: number; quotaDays: number; warnDays?: number }) {
  const pct = Math.min(100, (usedHours / (quotaDays * HOURS_PER_DAY)) * 100);
  const over = usedHours > quotaDays * HOURS_PER_DAY;
  const warn = warnDays !== undefined && usedHours > warnDays * HOURS_PER_DAY;
  const color = over ? "bg-danger" : warn ? "bg-gold" : "bg-teal";
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <span className="w-10 text-right font-mono text-[13px] tabular-nums">{hoursToDays(usedHours)}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-soft">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted">/{quotaDays}</span>
    </div>
  );
}

function AnnualCell({ employee, leaves, today }: { employee: EmployeeItem; leaves: LeaveItem[]; today: string }) {
  const period = annualPeriod(employee.hireDate, today);
  if (!period.days) return <span className="text-xs text-muted">{period.end} 起享 3 日</span>;
  const left = period.days * HOURS_PER_DAY - annualUsedHours(leaves, employee.id, period);
  return (
    <span className="font-mono tabular-nums">
      <b className={left < 0 ? "text-danger" : "text-navy"}>{hoursToDays(left)}</b>
      <span className="text-muted"> / {period.days} 日</span>
    </span>
  );
}

function RosterPanel({
  load,
  today,
  year,
  years,
  onYear,
  onOpen,
}: {
  load: Load;
  today: string;
  year: number;
  years: number[];
  onYear: (y: number) => void;
  onOpen: (e: EmployeeItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"在職" | "離職" | "全部">("在職");

  const employees = load.status === "ok" ? load.employees : [];
  const leaves = load.status === "ok" ? load.leaves : [];
  const q = query.trim().toLowerCase();
  const filtered = sortEmployees(employees).filter(
    (e) =>
      (status === "全部" || e.status === status) &&
      (!q || [e.name, e.empNo, e.dept, e.title].some((v) => v.toLowerCase().includes(q))),
  );

  const emptyText =
    load.status === "loading"
      ? "載入中…"
      : load.status === "error"
        ? `無法載入（${load.message}）`
        : employees.length === 0
          ? "還沒有員工資料。按「新增員工」建立第一位，系統會依到職日自動計算特休。"
          : filtered.length === 0
            ? "找不到符合的員工"
            : null;

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-start gap-2.5">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <SearchBox value={query} onChange={setQuery} placeholder="搜尋姓名、員工編號、部門、職稱" />
        </div>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="在職狀態">
          <option value="在職">在職</option>
          <option value="離職">離職</option>
          <option value="全部">全部</option>
        </select>
        <select className="input" value={year} onChange={(e) => onYear(Number(e.target.value))} aria-label="統計年度">
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
      </div>

      {/* 手機／平板：卡片 */}
      <div className="flex flex-col gap-2.5 xl:hidden">
        {emptyText ? (
          <p className="empty-hint">{emptyText}</p>
        ) : (
          filtered.map((e) => {
            const s = yearStats(leaves, e.id, year);
            return (
              <button key={e.id} type="button" className="list-card" onClick={() => onOpen(e)}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {e.empNo && <span className="id-chip">{e.empNo}</span>}
                  <span className="font-bold">{e.name}</span>
                  {e.status === "離職" && <span className="badge badge-muted">離職</span>}
                  <span className="ml-auto text-xs text-navy-2">假勤卡 ›</span>
                </div>
                <div className="list-card-row">
                  <span>年資</span>
                  <span>{seniorityText(e.hireDate, today)}</span>
                </div>
                <div className="list-card-row">
                  <span>特休剩餘</span>
                  <AnnualCell employee={e} leaves={leaves} today={today} />
                </div>
                <div className="list-card-row">
                  <span>{year} 事假／病假</span>
                  <span className="font-mono tabular-nums">
                    {hoursToDays(s.personalHours)}/14 · {hoursToDays(s.sickHours)}/30 日
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 電腦：表格 */}
      <div className="hidden overflow-x-auto xl:block">
        <table className="data-table nowrap">
          <thead>
            <tr>
              <th>員工</th>
              <th>部門／職稱</th>
              <th>到職日</th>
              <th>年資</th>
              <th>特休剩餘（本週期）</th>
              <th>{year} 事假</th>
              <th>{year} 病假</th>
            </tr>
          </thead>
          <tbody>
            {emptyText ? (
              <EmptyRow colSpan={7}>{emptyText}</EmptyRow>
            ) : (
              filtered.map((e) => {
                const s = yearStats(leaves, e.id, year);
                return (
                  <tr key={e.id} className="cursor-pointer" onClick={() => onOpen(e)}>
                    <td>
                      <div className="flex items-center gap-2">
                        {e.empNo && <span className="id-chip">{e.empNo}</span>}
                        <b>{e.name}</b>
                        {e.status === "離職" && <span className="badge badge-muted">離職</span>}
                      </div>
                    </td>
                    <td className="text-muted">{[e.dept, e.title].filter(Boolean).join("・") || "—"}</td>
                    <td className="font-mono tabular-nums">{e.hireDate}</td>
                    <td>{seniorityText(e.hireDate, today)}</td>
                    <td>
                      <AnnualCell employee={e} leaves={leaves} today={today} />
                    </td>
                    <td>
                      <Meter usedHours={s.personalHours} quotaDays={14} />
                    </td>
                    <td>
                      <Meter usedHours={s.sickHours} quotaDays={30} warnDays={10} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="form-hint mt-3">
        特休依週年制自到職日起算；事假、病假依所選年度統計。家庭照顧假併入事假，生理假超過全年 3 日的部分併入病假。
      </p>
    </div>
  );
}

// ── 員工假勤卡 ───────────────────────────────────────────────────

function EmployeeDetailModal({
  employee: e,
  leaves,
  today,
  year,
  onClose,
  onEdit,
  onLeave,
  onDeleted,
}: {
  employee: EmployeeItem;
  leaves: LeaveItem[];
  today: string;
  year: number;
  onClose: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onDeleted: () => void;
}) {
  const [message, setMessage] = useState<MessageState>({ text: "" });
  const [busy, setBusy] = useState(false);

  const period = annualPeriod(e.hireDate, today);
  const used = annualUsedHours(leaves, e.id, period);
  const left = period.days * HOURS_PER_DAY - used;
  const daysToEnd = daysBetween(today, period.end);
  const s = yearStats(leaves, e.id, year);
  const own = leaves.filter((l) => l.employeeId === e.id);
  const others = LEAVE_TYPES.filter(
    (t) => !["特休", "事假", "家庭照顧假", "普通傷病假", "生理假"].includes(t.name) && (s.byType[t.name] ?? 0) > 0,
  );

  async function remove() {
    if (!confirm(`確定刪除員工「${e.name}」？\n會一併刪除 ${own.length} 筆請假紀錄，無法復原。\n（只是離職的話，請改用「編輯資料」把狀態設為離職）`)) return;
    setBusy(true);
    setMessage({ text: "刪除中…" });
    try {
      await apiFetch(`/api/hr/employees/${e.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setMessage({ text: errorText(err, "刪除失敗"), kind: "error" });
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {e.name}
          {e.empNo && <span className="id-chip">{e.empNo}</span>}
          {e.status === "離職" && <span className="badge badge-danger">離職 {e.leftDate}</span>}
        </span>
      }
    >
      <div className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">部門／職稱</span>
        <span>{[e.dept, e.title].filter(Boolean).join("・") || "—"}</span>
        <span className="text-muted">到職日</span>
        <span className="font-mono">{e.hireDate}</span>
        <span className="text-muted">年資</span>
        <span>{seniorityText(e.hireDate, today)}</span>
        {e.phone && (
          <>
            <span className="text-muted">電話</span>
            <span className="font-mono">{e.phone}</span>
          </>
        )}
        {e.email && (
          <>
            <span className="text-muted">Email</span>
            <span className="break-all">{e.email}</span>
          </>
        )}
        {e.note && (
          <>
            <span className="text-muted">備註</span>
            <span className="whitespace-pre-wrap">{e.note}</span>
          </>
        )}
      </div>

      <div className="rounded-[12px] border border-line p-4">
        <div className="section-label">特別休假・本週期</div>
        {period.days ? (
          <>
            <div className="font-mono text-3xl font-bold text-navy tabular-nums">
              {hoursToDays(left)}
              <span className="ml-1 font-sans text-sm font-normal text-muted">日剩餘／應給 {period.days} 日</span>
            </div>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-navy-soft">
              <div
                className={`h-full ${left < 0 ? "bg-danger" : "bg-teal"}`}
                style={{ width: `${Math.min(100, (used / (period.days * HOURS_PER_DAY)) * 100)}%` }}
              />
            </div>
            <p className="form-hint">
              週期 {period.start} ～ {addDaysYMD(period.end, -1)}，已休 {formatHours(used)}。{period.end} 起下一週期應給 {period.nextDays} 日。
            </p>
            {left > 0 && daysToEnd <= 60 && (
              <p className="mt-1 text-xs font-semibold text-gold-dark">
                週期將於 {daysToEnd} 天後結束，未休的 {formatHours(left)} 應發給工資，或經協商遞延至下一年度。
              </p>
            )}
          </>
        ) : (
          <p className="text-sm">到職未滿 6 個月，{period.end} 起享 3 日特休。</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-line p-4">
          <div className="section-label">{year} 年事假</div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {hoursToDays(s.personalHours)}
            <span className="ml-1 font-sans text-sm font-normal text-muted">/ 14 日</span>
          </div>
          <p className="form-hint">含家庭照顧假 {formatHours(s.familyHours)}（上限 56 小時）</p>
        </div>
        <div className="rounded-[12px] border border-line p-4">
          <div className="section-label">{year} 年普通傷病假</div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {hoursToDays(s.sickHours)}
            <span className="ml-1 font-sans text-sm font-normal text-muted">/ 30 日</span>
          </div>
          <p className="form-hint">
            {s.sickHours <= 10 * HOURS_PER_DAY ? "10 日內，雇主不得不利處分" : "已超過 10 日保障範圍"}
            {s.menstrualHours > 0 && `；生理假 ${formatHours(s.menstrualHours)}`}
          </p>
        </div>
      </div>

      {others.length > 0 && (
        <div className="mt-3 rounded-[12px] border border-line p-4">
          <div className="section-label">{year} 年其他假別</div>
          {others.map((t) => (
            <div key={t.name} className="flex justify-between gap-3 py-1 text-sm">
              <span>
                {t.name} <span className="text-xs text-muted">{t.limit}</span>
              </span>
              <span className="font-mono">{formatHours(s.byType[t.name] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">請假紀錄（全部）</div>
      {own.length === 0 ? (
        <p className="empty-hint">尚無請假紀錄</p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {own.map((l) => (
            <div key={l.id} className="flex items-baseline gap-3 border-b border-dashed border-line py-1.5 text-sm last:border-0">
              <span className="font-mono text-xs tabular-nums">{l.date}</span>
              <span className="min-w-0 flex-1">
                <b>{l.type}</b> <span className="text-xs text-muted">{l.note}</span>
              </span>
              <span className="font-mono">{formatHours(l.hours)}</span>
            </div>
          ))}
        </div>
      )}

      <Message state={message} />
      <ModalActions>
        <button type="button" className="btn btn-danger mr-auto" onClick={remove} disabled={busy}>
          刪除員工
        </button>
        <button type="button" className="btn btn-outline" onClick={onEdit} disabled={busy}>
          編輯資料
        </button>
        <button type="button" className="btn btn-primary" onClick={onLeave} disabled={busy}>
          + 請假
        </button>
      </ModalActions>
    </Modal>
  );
}

// ── 員工表單 ─────────────────────────────────────────────────────

type EmployeeForm = Omit<EmployeeItem, "id">;

const EMPTY_EMPLOYEE: EmployeeForm = {
  empNo: "",
  name: "",
  dept: "",
  title: "",
  hireDate: "",
  gender: "",
  phone: "",
  email: "",
  status: "在職",
  leftDate: "",
  note: "",
};

function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: EmployeeItem | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [form, setForm] = useState<EmployeeForm>(() => (employee ? { ...EMPTY_EMPLOYEE, ...employee } : EMPTY_EMPLOYEE));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  const set = (key: keyof EmployeeForm) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: ev.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as EmployeeForm;
    if (!payload.name || !payload.hireDate) {
      setMessage({ text: "請填寫姓名與到職日", kind: "error" });
      return;
    }
    if (payload.status === "離職" && !payload.leftDate) payload.leftDate = todayISO();
    if (payload.status === "在職") payload.leftDate = "";

    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      if (employee) {
        await sendJson(`/api/hr/employees/${employee.id}`, "PATCH", payload);
        onSaved(employee.id);
      } else {
        const res = await sendJson<{ id: number }>("/api/hr/employees", "POST", payload);
        onSaved(res.id);
      }
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  const text = (key: keyof EmployeeForm, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>, required = false) => (
    <div className="form-field">
      <label htmlFor={`emp-${key}`}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <input id={`emp-${key}`} className="input" value={form[key]} onChange={set(key)} {...extra} />
    </div>
  );

  return (
    <Modal open onClose={onClose} title={employee ? "編輯員工資料" : "新增員工"}>
      <form onSubmit={submit}>
        <div className="section-label">基本資料</div>
        <div className="form-grid">
          {text("name", "姓名", undefined, true)}
          {text("empNo", "員工編號")}
          {text("dept", "部門")}
          {text("title", "職稱")}
          {text("hireDate", "到職日", { type: "date" }, true)}
          <div className="form-field">
            <label htmlFor="emp-gender">性別</label>
            <select id="emp-gender" className="input" value={form.gender} onChange={set("gender")}>
              <option value="">（未選擇）</option>
              <option value="女">女</option>
              <option value="男">男</option>
              <option value="其他">其他</option>
            </select>
          </div>
        </div>

        <div className="section-label">聯絡資訊</div>
        <div className="form-grid">
          {text("phone", "電話", { inputMode: "tel" })}
          {text("email", "Email", { type: "email" })}
        </div>

        <div className="section-label">在職狀態</div>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="emp-status">狀態</label>
            <select id="emp-status" className="input" value={form.status} onChange={set("status")}>
              <option value="在職">在職</option>
              <option value="離職">離職</option>
            </select>
          </div>
          {form.status === "離職" && text("leftDate", "離職日", { type: "date" })}
        </div>

        <div className="section-label">備註</div>
        <textarea id="emp-note" className="input w-full" value={form.note} onChange={set("note")} />

        <Message state={message} />
        <ModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            儲存
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

// ── 請假表單 ─────────────────────────────────────────────────────

function leaveHint(employee: EmployeeItem | undefined, leaves: LeaveItem[], type: string, date: string, hours: number) {
  const info = leaveTypeInfo(type);
  if (!employee || !info || !date) return { text: "", warn: false };
  const year = Number(date.slice(0, 4));
  const s = yearStats(leaves, employee.id, year);
  let text = `${info.name}：${info.limit}，${info.pay}。`;
  let warn = false;

  if (type === "特休") {
    const period = annualPeriod(employee.hireDate, date);
    const left = period.days * HOURS_PER_DAY - annualUsedHours(leaves, employee.id, period);
    text = `這個日期所屬的特休週期應給 ${period.days} 日，剩餘 ${formatHours(Math.max(0, left))}。`;
    if (hours > left) {
      warn = true;
      text += " 本次請假超過剩餘特休。";
    }
  } else if (type === "事假" || type === "家庭照顧假") {
    text += ` ${year} 年事假已用 ${formatHours(s.personalHours)}。`;
    if (s.personalHours + hours > 14 * HOURS_PER_DAY) {
      warn = true;
      text += " 加上本次將超過 14 日。";
    }
    if (type === "家庭照顧假" && s.familyHours + hours > 56) {
      warn = true;
      text += " 家庭照顧假將超過 56 小時。";
    }
  } else if (type === "普通傷病假" || type === "生理假") {
    text += ` ${year} 年病假已計 ${formatHours(s.sickHours)}。`;
    if (type === "普通傷病假" && s.sickHours + hours > 30 * HOURS_PER_DAY) {
      warn = true;
      text += " 加上本次將超過 30 日。";
    }
    if (type === "生理假" && employee.gender && employee.gender !== "女") {
      warn = true;
      text += " 請確認員工性別。";
    }
  } else if (info.quotaDays && hours > info.quotaDays * HOURS_PER_DAY) {
    warn = true;
    text += " 本次超過法定日數。";
  }
  return { text, warn };
}

function LeaveFormModal({
  employees,
  leaves,
  initialEmployeeId,
  onClose,
  onSaved,
}: {
  employees: EmployeeItem[];
  leaves: LeaveItem[];
  initialEmployeeId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = employees.filter((e) => e.status === "在職" || e.id === initialEmployeeId);
  const [employeeId, setEmployeeId] = useState<number>(initialEmployeeId ?? active[0]?.id ?? 0);
  const [type, setType] = useState("特休");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<"day" | "hour">("day");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  const hours = (Number(amount) || 0) * (unit === "day" ? HOURS_PER_DAY : 1);
  const employee = employees.find((e) => e.id === employeeId);
  const hint = leaveHint(employee, leaves, type, date, hours);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!employeeId) {
      setMessage({ text: "請選擇員工", kind: "error" });
      return;
    }
    if (hours <= 0) {
      setMessage({ text: "請輸入請假數量", kind: "error" });
      return;
    }
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      await sendJson("/api/hr/leaves", "POST", { employeeId, type, date, hours, note: note.trim() });
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="新增請假">
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field sm:col-span-2">
            <label htmlFor="leave-employee">
              員工<span className="ml-0.5 text-danger">*</span>
            </label>
            <select id="leave-employee" className="input" value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))}>
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.empNo ? `（${e.empNo}）` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="leave-type">假別</label>
            <select id="leave-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {LEAVE_TYPES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="leave-date">請假日期</label>
            <input id="leave-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="leave-amount">數量</label>
            <input
              id="leave-amount"
              type="number"
              min="0.5"
              step="0.5"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="leave-unit">單位</label>
            <select id="leave-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as "day" | "hour")}>
              <option value="day">天（8 小時）</option>
              <option value="hour">小時</option>
            </select>
          </div>
          <div className="form-field sm:col-span-2">
            <label htmlFor="leave-note">事由／備註</label>
            <input id="leave-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <p className="form-hint mt-2.5 text-xs">連續多天請假，請輸入第一天的日期和總天數。</p>
        {hint.text && <p className={`mt-1.5 text-[13px] ${hint.warn ? "font-semibold text-gold-dark" : "text-muted"}`}>{hint.text}</p>}

        <Message state={message} />
        <ModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            儲存
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

// ── 請假紀錄 ─────────────────────────────────────────────────────

function LeavesPanel({
  load,
  years,
  defaultYear,
  onChanged,
  onOpen,
}: {
  load: Load;
  years: number[];
  defaultYear: number;
  onChanged: () => void;
  onOpen: (employeeId: number) => void;
}) {
  const [employeeFilter, setEmployeeFilter] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(defaultYear);
  const [deleting, setDeleting] = useState<number | null>(null);

  const employees = load.status === "ok" ? sortEmployees(load.employees) : [];
  const leaves = load.status === "ok" ? load.leaves : [];
  const nameOf = (id: number, fallback: string) => employees.find((e) => e.id === id)?.name ?? (fallback || "（已刪除）");
  const filtered = leaves.filter(
    (l) =>
      (!employeeFilter || l.employeeId === employeeFilter) &&
      (!typeFilter || l.type === typeFilter) &&
      l.date.startsWith(`${yearFilter}-`),
  );

  async function remove(l: LeaveItem) {
    if (!confirm(`刪除這筆請假紀錄？\n${nameOf(l.employeeId, l.employeeName)}・${l.date}・${l.type}・${formatHours(l.hours)}`)) return;
    setDeleting(l.id);
    try {
      await apiFetch(`/api/hr/leaves/${l.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      alert("刪除失敗：" + errorText(err));
    } finally {
      setDeleting(null);
    }
  }

  const emptyText =
    load.status === "loading"
      ? "載入中…"
      : load.status === "error"
        ? `無法載入（${load.message}）`
        : filtered.length === 0
          ? `${yearFilter} 年沒有符合條件的請假紀錄`
          : null;

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap gap-2.5">
        <select className="input min-w-0 flex-1" value={employeeFilter} onChange={(e) => setEmployeeFilter(Number(e.target.value))} aria-label="員工">
          <option value={0}>全部員工</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.status === "離職" ? "（離職）" : ""}
            </option>
          ))}
        </select>
        <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="假別">
          <option value="">全部假別</option>
          {LEAVE_TYPES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="input" value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))} aria-label="年度">
          {years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table nowrap">
          <thead>
            <tr>
              <th>日期</th>
              <th>員工</th>
              <th>假別</th>
              <th>時數</th>
              <th>工資</th>
              <th>備註</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {emptyText ? (
              <EmptyRow colSpan={7}>{emptyText}</EmptyRow>
            ) : (
              filtered.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono tabular-nums">{l.date}</td>
                  <td>
                    <button type="button" className="cursor-pointer font-semibold text-navy-2 hover:underline" onClick={() => onOpen(l.employeeId)}>
                      {nameOf(l.employeeId, l.employeeName)}
                    </button>
                  </td>
                  <td>
                    <span className="badge">{l.type}</span>
                  </td>
                  <td className="font-mono">{formatHours(l.hours)}</td>
                  <td className="text-muted">{leaveTypeInfo(l.type)?.pay ?? ""}</td>
                  <td className="max-w-[260px] truncate text-muted">{l.note}</td>
                  <td>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(l)} disabled={deleting === l.id}>
                      刪除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 法規對照 ─────────────────────────────────────────────────────

function LawPanel() {
  const annual: [string, string][] = [
    ["滿 6 個月，未滿 1 年", "3 日"],
    ["滿 1 年，未滿 2 年", "7 日"],
    ["滿 2 年，未滿 3 年", "10 日"],
    ["滿 3 年，未滿 5 年", "每年 14 日"],
    ["滿 5 年，未滿 10 年", "每年 15 日"],
    ["滿 10 年以上", "每 1 年加 1 日，加至 30 日"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <h3>特別休假（勞基法第 38 條）</h3>
        <p className="mb-3 max-w-[68ch] text-sm leading-relaxed">
          勞工在同一雇主繼續工作滿一定期間，依年資給予特休。特休日期由勞工排定；年度終結或契約終止時未休完的日數，雇主應發給工資，經勞資協商可遞延至次一年度。
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>年資</th>
                <th>特休日數</th>
              </tr>
            </thead>
            <tbody>
              {annual.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="font-mono">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>其他假別（勞工請假規則、性別平等工作法）</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>假別</th>
                <th>日數上限</th>
                <th>工資</th>
                <th>說明</th>
              </tr>
            </thead>
            <tbody>
              {LEAVE_TYPES.filter((t) => t.name !== "特休").map((t) => (
                <tr key={t.name}>
                  <td className="font-bold whitespace-nowrap">{t.name}</td>
                  <td className="whitespace-nowrap">{t.limit}</td>
                  <td className="whitespace-nowrap">{t.pay}</td>
                  <td className="text-muted">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>115 年（2026）修正重點</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>一年內普通傷病假未超過 10 日，雇主不得給予不利處分；因病假扣全勤獎金應按日數比例計算。</li>
          <li>為親自照顧家庭成員所請的事假，可選擇以小時為單位（家庭照顧假全年 56 小時），雇主不得因此扣發全勤獎金。</li>
        </ul>
        <p className="form-hint mt-3">
          本頁以法定最低標準計算。公司若有優於法令的規定，或遇住院傷病、部分工時等特殊情況，請以實際規章及勞動部公告為準。
        </p>
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="card px-6 py-12 text-center">
      <h2 className="mb-2 text-xl font-bold text-navy">人事假勤還沒接上 Ragic</h2>
      <p className="mx-auto max-w-[52ch] text-sm text-muted">
        請先在 Ragic 建立「員工資料」與「請假紀錄」兩張表，再把表單路徑與欄位編號填進
        <code className="mx-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">src/server/lib/hrRagic.ts</code>
        。步驟見 docs/08-人事假勤模組-Ragic建表與積木式工單.md。「法規對照」分頁可以先看。
      </p>
    </div>
  );
}
