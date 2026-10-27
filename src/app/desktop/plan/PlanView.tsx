"use client";

// 預排班：先把一個月的班排出來，自動算每天／每月工時與薪資。
// 班別模板跟行事曆共用同一張 Ragic 表（/api/roster/templates）；排好的班存在獨立的「預排班」表（/api/plan），
// 按「匯入行事曆」前不會出現在行事曆、LINE 提醒，也不影響空檔推算。
import { useCallback, useEffect, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { Message, Modal, ModalActions, PageHeader, type MessageState } from "@/components/ui";
import {
  addMonths,
  apiFetch,
  currentMonth,
  errorText,
  formatCurrency,
  monthCells,
  monthCellsPadded,
  sendJson,
  todayISO,
  weekdayOf,
  WEEKDAYS,
} from "@/lib/client";
import { formatHours, paidMinutes, shiftPay, summarize } from "@/lib/payroll";
import { PLAN_EXCLUDED_TEMPLATES } from "@/lib/plan";
import type { PlanEntry, RosterTemplate } from "@/lib/types";
import { NewTemplateModal } from "../calendar/CalendarModals";

type Load =
  | { status: "loading" }
  | { status: "notConfigured" }
  | { status: "error"; message: string }
  | { status: "ok"; entries: PlanEntry[]; templatePay: boolean; doublePay: boolean };

// 結算日：班別模板（Ragic「結算日」欄位）填 20 的班別，本期 = 上月 21 日～本月 20 日，其餘照日曆月。
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
};
function periodRange(month: string, settle20: boolean): [string, string] {
  if (!settle20) return [`${month}-01`, `${month}-${String(lastDay(month)).padStart(2, "0")}`];
  return [`${addMonths(month, -1)}-21`, `${month}-20`];
}

// 匯入行事曆的班別篩選：依班別名稱開頭分類
const IMPORT_PREFIXES = ["迪卡儂", "駿斯"];

const colorOf = (templates: RosterTemplate[], name: string) => templates.find((t) => t.name === name)?.color || "#5A6570";

export function PlanView() {
  const today = todayISO();
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState(today);
  const [templates, setTemplates] = useState<RosterTemplate[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [picked, setPicked] = useState<RosterTemplate | null>(null);
  const [modal, setModal] = useState<
    { kind: "template" } | { kind: "repeat"; template: RosterTemplate } | null
  >(null);
  const [notice, setNotice] = useState("");
  const [importPrefix, setImportPrefix] = useState(""); // 班別篩選：名稱開頭（迪卡儂／駿斯），空白＝全部
  const [settleFilter, setSettleFilter] = useState<"all" | "month" | "d20">("all");
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    apiFetch<RosterTemplate[]>("/api/roster/templates").then(
      (list) => setTemplates(list.filter((t) => t.active && !PLAN_EXCLUDED_TEMPLATES.has(t.name))),
      () => setTemplates([]),
    );
  }, [version]);

  useEffect(() => {
    apiFetch<{ entries: PlanEntry[]; templatePay: boolean; doublePay: boolean }>("/api/plan").then(
      (data) => setLoad({ status: "ok", ...data }),
      (err) => {
        const message = errorText(err);
        setLoad(message.includes("尚未設定") ? { status: "notConfigured" } : { status: "error", message });
      },
    );
  }, [version]);

  const settle20 = new Set(templates.filter((t) => t.settleDay === 20).map((t) => t.name));
  // 班別篩選（迪卡儂／駿斯）：月曆、當日班表、薪資彙總與匯入行事曆都用同一個篩選
  const allEntries = (load.status === "ok" ? load.entries : []).filter((e) => e.name.startsWith(importPrefix));
  const entries = allEntries.filter((e) => e.date.startsWith(month)); // 月曆顯示用
  // 下方「工時與薪資」：每筆班依自己的結算日歸期，再套班別／結算方式篩選
  const periodEntries = allEntries.filter((e) => {
    const is20 = settle20.has(e.name);
    if (settleFilter === "month" && is20) return false;
    if (settleFilter === "d20" && !is20) return false;
    const [from, to] = periodRange(month, is20);
    return e.date >= from && e.date <= to;
  });
  const ready = load.status === "ok";
  const byDate = new Map<string, PlanEntry[]>();
  // 日曆格子用全部班（含相鄰月份補在空白格的），薪資統計仍只算這個月／結算期
  for (const e of allEntries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const summary = summarize(periodEntries, (e) => ({ key: e.name, label: e.name }));

  async function addToDate(date: string, template: RosterTemplate) {
    try {
      await sendJson("/api/plan", "POST", { templateCode: template.code, dates: [date] });
      setNotice("");
      refresh();
    } catch (err) {
      setNotice(errorText(err, "排入失敗"));
    }
  }

  function onDateClick(date: string) {
    setSelected(date);
    if (picked && ready) void addToDate(date, picked);
  }

  const dayEntries = byDate.get(selected) ?? [];

  // 時薪是 0 的班：多半是排班時模板還沒設時薪（時薪在排班當下就記下來了，之後改模板不會自動更新）。
  // 只補「時薪為 0、且模板現在有時薪」的班，不動手動調過的班。
  const rateFixes = periodEntries.flatMap((e) => {
    const t = templates.find((x) => x.name === e.name);
    return e.rate === 0 && t && t.rate > 0 ? [{ entry: e, rate: t.rate }] : [];
  });
  const zeroRateCount = periodEntries.filter((e) => e.rate === 0).length;
  const [fixing, setFixing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState("");

  // 薪資實領：整個結算期（月）領到的總額，一個結算方式一筆（全部／月底結算／20 日結算）
  const PAY_LABEL = { all: "全部", month: "月底結算", d20: "20 日結算" } as const;
  const payKey = PAY_LABEL[settleFilter];
  const [payslips, setPayslips] = useState<Record<string, number>>({});
  // 輸入中的值綁定它屬於哪個月份＋結算方式，切換後自動失效，不會帶到別的期別
  const [draftState, setDraftState] = useState<{ id: string; value: string } | null>(null);
  const draftId = `${month}|${payKey}`;
  const payDraft = draftState?.id === draftId ? draftState.value : null;
  const setPayDraft = (value: string | null) => setDraftState(value === null ? null : { id: draftId, value });
  const [payBusy, setPayBusy] = useState(false);
  useEffect(() => {
    apiFetch<{ name: string; amount: number }[]>(`/api/plan/payslip?month=${month}`).then(
      (list) => setPayslips(Object.fromEntries(list.map((p) => [p.name, p.amount]))),
      () => setPayslips({}),
    );
  }, [month, version]);

  async function savePayslip() {
    setPayBusy(true);
    try {
      await sendJson("/api/plan/payslip", "POST", { month, name: payKey, amount: (payDraft ?? "").trim() });
      setPayDraft(null);
      setNotice("");
      refresh();
    } catch (err) {
      setNotice(errorText(err, "儲存實領失敗"));
    } finally {
      setPayBusy(false);
    }
  }

  const doublePay = load.status === "ok" && load.doublePay;

  async function toggleDouble(entry: PlanEntry) {
    try {
      await sendJson(`/api/plan/${entry.id}`, "PATCH", { double: !entry.double });
      refresh();
    } catch (err) {
      setNotice(errorText(err, "更新失敗"));
    }
  }

  async function removeEntry(entry: PlanEntry) {
    if (!confirm(`刪除 ${entry.date} 的「${entry.name}」？`)) return;
    try {
      await apiFetch(`/api/plan/${entry.id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setNotice(errorText(err, "刪除失敗"));
    }
  }

  async function importToCalendar() {
    if (!window.confirm(`把 ${month} 的${IMPORT_PREFIXES.includes(importPrefix) && importPrefix ? `「${importPrefix}」` : ""}預排班匯入行事曆？已在行事曆上的班會自動略過。`)) return;
    setImporting(true);
    setNotice("");
    setImportDone("");
    try {
      const r = await sendJson<{ imported: number; failed: number; skipped: number }>("/api/plan/import", "POST", {
        month,
        prefix: IMPORT_PREFIXES.includes(importPrefix) ? importPrefix : "",
      });
      if (r.failed > 0) setNotice(`匯入 ${r.imported} 筆，有 ${r.failed} 筆失敗，請再按一次`);
      else setImportDone(`已匯入 ${r.imported} 筆到行事曆（略過已存在 ${r.skipped} 筆）`);
    } catch (err) {
      setNotice(errorText(err, "匯入失敗"));
    } finally {
      setImporting(false);
    }
  }

  // 模板時間改過後，把「這個月（含目前班別篩選）」已排班的時間／休息／時薪更新成模板現在的值。
  // 每月各自同步，不動其他月份；模板時薪是 0（未設定）時不覆蓋既有時薪。
  const syncList = entries.flatMap((e) => {
    const t = templates.find((x) => x.name === e.name);
    if (!t) return [];
    const rate = t.rate > 0 ? t.rate : e.rate;
    const changed = e.start !== t.start || e.end !== t.end || e.breakMin !== t.breakMin || e.rate !== rate;
    return changed ? [{ entry: e, start: t.start, end: t.end, breakMin: t.breakMin, rate }] : [];
  });
  const [syncing, setSyncing] = useState(false);

  async function syncFromTemplates() {
    if (!window.confirm(`把 ${month} 的 ${syncList.length} 筆班，時間／休息／時薪更新成班別模板現在的設定？`)) return;
    setSyncing(true);
    setNotice("");
    try {
      const results = await Promise.allSettled(
        syncList.map(({ entry, ...body }) => sendJson(`/api/plan/${entry.id}`, "PATCH", body)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) setNotice(`有 ${failed} 筆更新失敗，請再按一次`);
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  async function fillRates() {
    setFixing(true);
    setNotice("");
    try {
      const results = await Promise.allSettled(
        rateFixes.map((f) => sendJson(`/api/plan/${f.entry.id}`, "PATCH", { rate: f.rate })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) setNotice(`有 ${failed} 筆更新失敗，請再按一次`);
    } finally {
      setFixing(false);
      refresh();
    }
  }

  return (
    <>
      <PageHeader
        title="預排班"
        subtitle="先排好整個月的班，自動算工時與薪資。排完按「匯入行事曆」才會進行事曆。"
      />

      {load.status === "notConfigured" && <SetupNotice />}
      {load.status === "error" && <p className="mb-4 font-semibold text-danger">無法載入預排班：{load.message}</p>}
      {load.status === "ok" && !load.templatePay && <PayFieldNotice />}
      {notice && <p className="mb-3 font-semibold text-danger">{notice}</p>}
      {importDone && <p className="mb-3 font-semibold text-teal">{importDone}</p>}

      {/* 班別模板（跟行事曆同一份） */}
      <section className="card mb-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="mb-0">班別模板</h3>
          <span className="form-hint">跟行事曆共用同一份。點模板後再點日期即可排入；模板可設時薪與休息分鐘</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {templates.length === 0 ? (
            <p className="empty-hint">還沒有班別模板，點右邊 ＋ 新增</p>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setPicked((p) => (p?.id === t.id ? null : t))}
                className={`min-w-[160px] flex-none cursor-pointer rounded-[11px] border-[1.5px] bg-white px-3 py-2.5 text-left hover:border-navy ${
                  picked?.id === t.id ? "border-navy shadow-[0_0_0_3px_rgba(11,61,92,.12)]" : "border-line"
                }`}
              >
                <span className="mr-1.5 inline-block size-[9px] rounded-[3px]" style={{ background: t.color }} />
                <span className="text-[13px] font-bold">{t.name}</span>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {t.start} – {t.end}
                  {t.breakMin ? `（休 ${t.breakMin} 分）` : ""}
                </div>
                <div className="text-[11.5px] text-muted">
                  {formatHours(paidMinutes(t))} 小時{t.rate ? ` · 時薪 ${formatCurrency(t.rate)}` : " · 未設時薪"}
                </div>
                <button
                  type="button"
                  disabled={!ready}
                  className="mt-2 cursor-pointer rounded-md bg-page px-2 py-[3px] text-[10.5px] font-bold text-navy hover:bg-navy hover:text-white disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ kind: "repeat", template: t });
                  }}
                >
                  整月重複排班
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
            <button type="button" className="ml-auto cursor-pointer rounded-[7px] bg-white/16 px-2.5 py-1 text-xs" onClick={() => setPicked(null)}>
              取消
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[2fr_1fr]">
        <section className="card min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h3 className="mb-0">{month}</h3>
            <div className="nav-compact flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
              <button className="btn btn-outline px-3" onClick={() => setMonth((m) => addMonths(m, -1))}>
                ‹ 上月
              </button>
              <MonthPicker value={month} onChange={setMonth} />
              <button className="btn btn-outline px-3" onClick={() => setMonth((m) => addMonths(m, 1))}>
                下月 ›
              </button>
              <button
                className="btn btn-outline px-3"
                onClick={() => {
                  setMonth(currentMonth());
                  setSelected(today);
                }}
              >
                本月
              </button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <select
              className="btn btn-outline cursor-pointer font-semibold"
              aria-label="匯入的班別"
              value={IMPORT_PREFIXES.includes(importPrefix) ? importPrefix : ""}
              onChange={(e) => setImportPrefix(e.target.value)}
            >
              <option value="">全部班別</option>
              {IMPORT_PREFIXES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <button className="btn btn-outline" disabled={syncing || syncList.length === 0} onClick={syncFromTemplates}>
              {syncing ? "同步中…" : syncList.length > 0 ? `同步模板時間（${syncList.length}）` : "同步模板時間"}
            </button>
            <button className="btn btn-primary" disabled={!ready || importing || entries.length === 0} onClick={importToCalendar}>
              {importing ? "匯入中…" : "匯入行事曆"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-xs text-muted">
                {w}
              </div>
            ))}
            {monthCellsPadded(month).map(({ date, outside }) => {
              const list = byDate.get(date) ?? [];
              const dayMin = outside ? 0 : list.reduce((s, e) => s + paidMinutes(e), 0);
              return (
                <div
                  key={date}
                  onClick={() => onDateClick(date)}
                  className={`min-h-[68px] min-w-0 cursor-pointer rounded-[9px] border px-[3px] py-1 hover:border-navy sm:min-h-[90px] sm:px-[7px] sm:py-1.5 ${
                    date === selected ? "border-navy bg-navy-soft shadow-[inset_0_0_0_1px_var(--color-navy)]" : outside ? "border-line bg-[#FAFCFD]" : "border-line bg-white"
                  } ${outside ? "opacity-45" : ""}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-[13px] font-bold ${date === today ? "text-gold" : ""} ${outside ? "font-normal text-muted" : ""}`}>
                      {outside && Number(date.slice(8)) === 1 ? `${Number(date.slice(5, 7))}/` : ""}
                      {Number(date.slice(8))}
                    </span>
                    {dayMin > 0 && <span className="text-[10px] text-muted">{formatHours(dayMin)}h</span>}
                  </div>
                  {list.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className="mt-0.5 overflow-hidden rounded px-[3px] text-[9px] leading-[14px] font-bold whitespace-nowrap text-white sm:mt-1 sm:h-4 sm:px-[5px] sm:text-[10px]"
                      style={{ background: colorOf(templates, e.name) }}
                    >
                      {e.double ? "×2 " : ""}
                      {e.name}
                    </div>
                  ))}
                  {list.length > 3 && <div className="form-hint">+{list.length - 3} 筆</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* 當天面板 */}
        <section className="card min-w-0 self-start">
          <h3>
            {selected.slice(5).replace("-", "/")}（{WEEKDAYS[weekdayOf(selected)]}）
          </h3>
          {dayEntries.length === 0 ? (
            <p className="empty-hint">這天還沒排班{picked ? "" : "，先在上面點一個班別模板再點日期"}</p>
          ) : (
            dayEntries.map((e) => (
              <div
                key={e.id}
                className="mb-2 flex items-center justify-between gap-2 rounded-[9px] border-l-[3px] bg-page px-3 py-2"
                style={{ borderLeftColor: colorOf(templates, e.name) }}
              >
                <div className="min-w-0 text-[13px]">
                  <div className="font-bold">
                    {e.name}
                    {e.double ? <span className="badge badge-gold ml-1.5">×2 雙倍</span> : null}
                  </div>
                  <div className="text-muted">
                    {e.start}–{e.end} · {formatHours(paidMinutes(e))} 小時 · {formatCurrency(shiftPay(e))}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {doublePay && (
                    <label className="flex cursor-pointer items-center gap-1 text-xs">
                      <input type="checkbox" checked={e.double ?? false} onChange={() => void toggleDouble(e)} />
                      雙倍
                    </label>
                  )}
                  <button className="btn btn-outline btn-sm text-danger" onClick={() => void removeEntry(e)}>
                    刪除
                  </button>
                </div>
              </div>
            ))
          )}
          {picked && ready && (
            <button className="btn btn-primary mt-2 w-full" onClick={() => void addToDate(selected, picked)}>
              再排一個「{picked.name}」
            </button>
          )}
        </section>
      </div>

      {/* 月薪資彙總 */}
      <section className="card mt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="mb-0">{month} 結算期 工時與薪資</h3>
          <span className="text-sm text-muted">
            共 {summary.count} 班 · <b className="text-navy">{formatHours(summary.minutes)}</b> 小時 ·{" "}
            <b className="text-navy">{formatCurrency(summary.pay)}</b>
          </span>
        </div>
        <div className="mb-3 flex flex-wrap items-end gap-x-5 gap-y-1 border-b border-line">
          {(
            [
              ["all", "全部"],
              ["month", "月底結算"],
              ["d20", "20 日結算"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSettleFilter(v)}
              className={`-mb-px border-b-2 px-1 pb-2 text-[14px] ${
                settleFilter === v ? "border-navy font-bold text-navy" : "border-transparent text-muted"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto pb-2 text-[12px] text-muted">
            {settleFilter !== "d20" && `月底：${periodRange(month, false)[0].slice(5)} ～ ${periodRange(month, false)[1].slice(5)}`}
            {settleFilter === "all" && "　"}
            {settleFilter !== "month" && `20 日：${periodRange(month, true)[0].slice(5)} ～ ${periodRange(month, true)[1].slice(5)}`}
          </span>
        </div>
        {zeroRateCount > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[9px] border-l-4 border-gold bg-page px-3 py-2 text-[13px]">
            <span>
              有 <b>{zeroRateCount}</b> 班的時薪是 0，薪資沒有計入。
              {rateFixes.length > 0
                ? `其中 ${rateFixes.length} 班的班別模板現在已有時薪，可以一鍵補上。`
                : "請先到班別模板設定時薪，或點「編輯」單筆填寫。"}
            </span>
            {rateFixes.length > 0 && (
              <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={fixing} onClick={fillRates}>
                {fixing ? "補上中…" : `補上模板時薪（${rateFixes.length} 班）`}
              </button>
            )}
          </div>
        )}
        {summary.count === 0 ? (
          <p className="empty-hint">這個結算期沒有符合的排班</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table nowrap">
                <thead>
                  <tr>
                    <th>班別</th>
                    <th>班數</th>
                    <th>工時（小時）</th>
                    <th>薪資</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.groups.map((g) => (
                    <tr key={g.key}>
                      <td>{g.label}</td>
                      <td>{g.count}</td>
                      <td>{formatHours(g.minutes)}</td>
                      <td>{formatCurrency(g.pay)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td>合計</td>
                    <td>{summary.count}</td>
                    <td>{formatHours(summary.minutes)}</td>
                    <td>{formatCurrency(summary.pay)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {settleFilter === "all" ? (
              (() => {
                // 「全部」不能輸入：只加總「月底結算」「20 日結算」各自填的實領，跟那兩邊的系統薪資比
                const parts = (["month", "d20"] as const).map((k) => {
                  const label = PAY_LABEL[k];
                  const system = periodEntries.filter((e) => settle20.has(e.name) === (k === "d20")).reduce((sum, e) => sum + shiftPay(e), 0);
                  return { label, system, actual: payslips[label] };
                });
                const filled = parts.filter((p) => p.actual !== undefined);
                const actual = filled.reduce((sum, p) => sum + (p.actual ?? 0), 0);
                const system = filled.reduce((sum, p) => sum + p.system, 0);
                const diff = actual - system;
                return (
                  <div className="mt-3 rounded-[9px] bg-page px-3 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <b>{month} 實領（加總）</b>
                      {parts.map((p) => (
                        <span key={p.label} className="text-muted">
                          {p.label}：{p.actual === undefined ? "未填" : formatCurrency(p.actual)}
                        </span>
                      ))}
                      {filled.length > 0 && (
                        <>
                          <b>合計 {formatCurrency(actual)}</b>
                          <b className={diff === 0 ? "text-muted" : diff > 0 ? "text-teal" : "text-danger"}>
                            {diff === 0 ? "吻合" : `差額 ${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`}
                          </b>
                        </>
                      )}
                    </div>
                    <p className="form-hint mt-1">
                      實領請到「月底結算」「20 日結算」分頁填；這裡只加總，差額只比對有填的項目（系統算 {formatCurrency(system)}）。
                    </p>
                  </div>
                );
              })()
            ) : (
              (() => {
                const actual = payslips[payKey];
                const diff = actual === undefined ? null : actual - summary.pay;
                const dirty = payDraft !== null && payDraft !== String(actual ?? "");
                return (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[9px] bg-page px-3 py-2.5 text-[13px]">
                    <b>{month}（{payKey}）實領</b>
                    <input
                      className="input w-36"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="填這個月實領"
                      value={payDraft ?? String(actual ?? "")}
                      onChange={(e) => setPayDraft(e.target.value)}
                      aria-label="本月實領金額"
                    />
                    {dirty && (
                      <button className="btn btn-primary btn-sm" disabled={payBusy} onClick={() => void savePayslip()}>
                        {payBusy ? "儲存中…" : "儲存"}
                      </button>
                    )}
                    <span className="text-muted">系統算 {formatCurrency(summary.pay)}</span>
                    {diff !== null && (
                      <b className={diff === 0 ? "text-muted" : diff > 0 ? "text-teal" : "text-danger"}>
                        {diff === 0 ? "吻合" : `差額 ${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`}
                      </b>
                    )}
                  </div>
                );
              })()
            )}
            <h3 className="mt-5">明細</h3>
            <div className="overflow-x-auto">
              <table className="data-table nowrap">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>班別</th>
                    <th>時間</th>
                    <th>休息</th>
                    <th>工時</th>
                    <th>時薪</th>
                    <th>薪資</th>
                    {doublePay && <th>雙倍</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {periodEntries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.date.slice(5).replace("-", "/")}（{WEEKDAYS[weekdayOf(e.date)]}）
                      </td>
                      <td>{e.name}</td>
                      <td>
                        {e.start}–{e.end}
                      </td>
                      <td>{e.breakMin} 分</td>
                      <td>{formatHours(paidMinutes(e))}</td>
                      <td>{formatCurrency(e.rate)}</td>
                      <td>{formatCurrency(shiftPay(e))}</td>
                      {doublePay && (
                        <td>
                          <input type="checkbox" checked={e.double ?? false} onChange={() => void toggleDouble(e)} aria-label="雙倍" />
                        </td>
                      )}
                      <td>
                        <button className="btn btn-outline btn-sm text-danger" onClick={() => void removeEntry(e)}>
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {modal?.kind === "template" && (
        <NewTemplateModal
          templateCount={templates.length}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal?.kind === "repeat" && (
        <MonthRepeatModal
          template={modal.template}
          month={month}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

// 選星期，把整個月符合的日期一次排入
function MonthRepeatModal({
  template,
  month,
  onClose,
  onDone,
}: {
  template: RosterTemplate;
  month: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dows, setDows] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });
  const dates = monthCells(month).filter((d): d is string => d !== null && dows.has(weekdayOf(d)));

  function toggle(d: number) {
    setDows((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function save() {
    if (dates.length === 0) return setMessage({ text: "請先選星期", kind: "error" });
    setSaving(true);
    setMessage({ text: "排班中…" });
    try {
      const res = await sendJson<{ failed: number }>("/api/plan", "POST", { templateCode: template.code, dates });
      if (res.failed > 0) {
        setMessage({ text: `有 ${res.failed} 筆失敗，請檢查後重試`, kind: "error" });
        setSaving(false);
        return;
      }
      onDone();
    } catch (err) {
      setMessage({ text: errorText(err, "排班失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${month} 整月排「${template.name}」`}>
      <div className="form-field">
        <label>每週哪幾天上班</label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => toggle(i)}
              className={`size-9 cursor-pointer rounded-[10px] border-2 text-[13px] font-bold ${
                dows.has(i) ? "border-navy bg-navy text-white" : "border-line bg-white text-muted"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
        <p className="form-hint mt-2">會排入 {dates.length} 天（已經排過的日子會再多一筆，排之前請確認）</p>
      </div>
      <Message state={message} />
      <ModalActions>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          取消
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          排入 {dates.length} 天
        </button>
      </ModalActions>
    </Modal>
  );
}

function SetupNotice() {
  return (
    <div className="card mb-5 px-6 py-8 text-center">
      <h2 className="mb-2 text-xl font-bold text-navy">預排班還沒接上 Ragic</h2>
      <p className="mx-auto max-w-[56ch] text-sm text-muted">
        請先在 Ragic 建立「預排班」表，並在班別模板表加上「時薪」「休息分鐘」兩欄，再把欄位編號填進
        <code className="mx-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">src/server/ragic/fields.ts</code>
        。欄位清單與步驟見 docs/10-預排班-Ragic建表.md。
      </p>
    </div>
  );
}

function PayFieldNotice() {
  return (
    <div className="card mb-5 border-l-4 border-gold px-4 py-3 text-sm text-muted">
      班別模板還沒有「時薪」「休息分鐘」欄位，新增模板時填的時薪不會被儲存。請依 docs/10-預排班-Ragic建表.md 在 Ragic 模板表加欄位後，把編號填進
      fields.ts 的 F_TEMPLATE.rate／breakMin。
    </div>
  );
}
