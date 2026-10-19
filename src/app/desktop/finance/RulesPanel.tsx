"use client";

import { useState } from "react";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import type { AccountWithBalance, CategoryItem, FinanceSettings, RuleItem, RunDailyResult, TxType } from "@/lib/financeTypes";
import { RULE_FREQ, TX_TYPE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { EntityForm, Msg, money, opts, useApi } from "./shared";

const WEEKDAYS = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

function describe(r: RuleItem): string {
  if (r.freq === RULE_FREQ.每週) return `每 ${r.intervalN > 1 ? r.intervalN : ""}週・${WEEKDAYS[r.day] ?? r.day}`;
  if (r.freq === RULE_FREQ.每N月) return `每 ${r.intervalN} 個月・${r.day} 號`;
  if (r.freq === RULE_FREQ.每年) return `每年・${r.start.slice(5, 7)} 月 ${r.day} 號`;
  return `每月・${r.day} 號`;
}

// 帳戶與分類頁下半部：定期收支規則、財務設定（提醒）、每日引擎（預覽／手動執行）
export function RulesPanel({
  accounts,
  categories,
  version,
  onChanged,
}: {
  accounts: AccountWithBalance[];
  categories: CategoryItem[];
  version: number;
  onChanged: () => void;
}) {
  const rules = useApi<RuleItem[]>("/api/finance/rules", version);
  const settings = useApi<FinanceSettings>("/api/finance/settings", version);
  const [editing, setEditing] = useState<RuleItem | "new" | null>(null);
  const [editSettings, setEditSettings] = useState(false);
  const [run, setRun] = useState<RunDailyResult | null>(null);
  const [runMsg, setRunMsg] = useState<{ text: string; kind?: "error" | "ok" }>({ text: "" });
  const [busy, setBusy] = useState(false);
  const activeAccounts = accounts.filter((a) => a.active);
  const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;

  async function runDaily(dryRun: boolean) {
    setBusy(true);
    setRunMsg({ text: "" });
    try {
      const res = await apiFetch<RunDailyResult>(`/api/finance/run-daily${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
      setRun(res);
      setRunMsg({ text: dryRun ? "預覽完成（沒有寫入任何資料）" : `執行完成：新增 ${res.created.length} 筆明細${res.pushed ? "，已推播 LINE" : ""}`, kind: "ok" });
      if (!dryRun) {
        settings.reload();
        onChanged();
      }
    } catch (err) {
      setRunMsg({ text: errorText(err, "執行失敗"), kind: "error" });
    }
    setBusy(false);
  }

  const fields = [
    { key: "name", label: "規則名稱", kind: "text" as const, hint: "例：房租、電信費、Netflix、固定薪資" },
    { key: "type", label: "類型", kind: "select" as const, options: opts(Object.values(TX_TYPE)), half: true },
    { key: "amount", label: "金額（整數）", kind: "number" as const, half: true },
    { key: "account", label: "帳戶（轉帳＝轉出）", kind: "select" as const, options: activeAccounts.map((a) => ({ value: a.code, label: a.name })), half: true },
    {
      key: "toAccount",
      label: "轉入帳戶",
      kind: "select" as const,
      options: activeAccounts.map((a) => ({ value: a.code, label: a.name })),
      half: true,
      show: (v: Record<string, string | boolean>) => v.type === TX_TYPE.轉帳,
    },
    {
      key: "category",
      label: "分類",
      kind: "select" as const,
      half: true,
      options: categories.filter((c) => c.active).map((c) => ({ value: c.name, label: `${c.kind}｜${c.name}` })),
      show: (v: Record<string, string | boolean>) => v.type !== TX_TYPE.轉帳,
    },
    { key: "freq", label: "頻率", kind: "select" as const, options: opts(Object.values(RULE_FREQ)), half: true },
    { key: "intervalN", label: "間隔（每幾個月／幾週）", kind: "number" as const, half: true, hint: "每月／每年填 1" },
    { key: "day", label: "執行日", kind: "number" as const, half: true, hint: "每月／每年＝幾號（29–31 遇小月自動夾到月底）；每週＝星期幾（1=週一…7=週日）" },
    { key: "start", label: "開始日", kind: "date" as const, half: true },
    { key: "end", label: "結束日（可空）", kind: "date" as const, half: true },
    { key: "remindDays", label: "提前幾天提醒", kind: "number" as const, half: true },
    { key: "autoPost", label: "自動入帳（取消勾選＝產生「預定」，等你確認）", kind: "check" as const },
    { key: "active", label: "啟用", kind: "check" as const },
  ];

  return (
    <>
      <div className={`${s.card} ${s.sectionGap}`}>
        <div className={s.toolbar}>
          <h3 className={s.cardTitle} style={{ margin: 0 }}>
            定期收支規則
          </h3>
          <span className={s.spacer} />
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditing("new")} disabled={accounts.length === 0}>
            + 新增規則
          </button>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>名稱</th>
                <th>類型</th>
                <th className={s.right}>金額</th>
                <th>帳戶</th>
                <th>頻率</th>
                <th>入帳</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!rules.data ? (
                <tr>
                  <td colSpan={8} className={s.empty}>
                    讀取中…
                  </td>
                </tr>
              ) : rules.data.length === 0 ? (
                <tr>
                  <td colSpan={8} className={s.empty}>
                    還沒有定期規則（房租、電信費、訂閱、固定薪資…）
                  </td>
                </tr>
              ) : (
                rules.data.map((r) => (
                  <tr key={r.id} data-testid={`rule-${r.code}`}>
                    <td>{r.name}</td>
                    <td>{r.type}</td>
                    <td className={s.right}>{money(r.amount)}</td>
                    <td>{r.type === TX_TYPE.轉帳 ? `${nameOf(r.account)} → ${nameOf(r.toAccount)}` : nameOf(r.account)}</td>
                    <td>{describe(r)}</td>
                    <td>{r.autoPost ? "自動入帳" : "預定（需確認）"}</td>
                    <td>{r.active ? "啟用" : <span className={s.muted}>停用</span>}</td>
                    <td className={s.right}>
                      <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditing(r)}>
                        編輯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rules.error ? <Msg text={rules.error} kind="error" /> : null}
      </div>

      <div className={`${s.card} ${s.sectionGap}`}>
        <div className={s.toolbar}>
          <h3 className={s.cardTitle} style={{ margin: 0 }}>
            每日引擎與提醒
          </h3>
          <span className={s.spacer} />
          <button className={s.btn} onClick={() => setEditSettings(true)} disabled={!settings.data}>
            提醒設定
          </button>
          <button className={s.btn} onClick={() => runDaily(true)} disabled={busy}>
            預覽今天會產生什麼
          </button>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => runDaily(false)} disabled={busy}>
            立即執行
          </button>
        </div>
        <p className={s.inlineNote} data-testid="engine-settings">
          提醒 {settings.data?.remindOn ? "開" : "關"}・預設提前 {settings.data?.defaultRemindDays ?? "—"} 天・上次執行日 {settings.data?.lastRun || "尚未執行"}。
          排程由 cron-job.org 每天 08:30 呼叫 /api/cron/finance-daily 自動執行；這裡是手動補跑，重複執行不會產生重複明細。
        </p>
        <Msg text={runMsg.text} kind={runMsg.kind} />
        {run ? (
          <div data-testid="engine-result">
            <p>
              區間 {run.from} ～ {run.to}：{run.dryRun ? "將新增" : "已新增"} <b>{run.created.length}</b> 筆明細，已存在而跳過 {run.skippedExisting} 筆
            </p>
            {run.created.length > 0 ? (
              <ul>
                {run.created.map((c) => (
                  <li key={c.sourceKey}>
                    {c.date}　{c.summary}　{money(c.amount)}　<span className={s.sub}>{c.status}・{c.sourceKey}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {run.statements.map((st) => (
              <p key={st.code + st.action} className={s.sub}>
                帳單 {st.code}：{st.action}
              </p>
            ))}
            {run.warnings.map((w) => (
              <p key={w} className={`${s.msg} ${s.msgError}`}>
                ⚠ {w}
              </p>
            ))}
            {run.pushText ? <div className={s.pre}>{run.pushText}</div> : <p className={s.sub}>目前沒有需要推播的項目。</p>}
          </div>
        ) : null}
      </div>

      {editing ? (
        <EntityForm
          title={editing === "new" ? "新增定期規則" : `編輯規則 ${editing.code}`}
          initial={
            editing === "new"
              ? { name: "", type: TX_TYPE.支出 as TxType, amount: "", account: activeAccounts[0]?.code ?? "", toAccount: "", category: "", freq: RULE_FREQ.每月, intervalN: "1", day: "", start: "", end: "", remindDays: "3", autoPost: true, active: true }
              : { name: editing.name, type: editing.type, amount: String(editing.amount), account: editing.account, toAccount: editing.toAccount, category: editing.category, freq: editing.freq, intervalN: String(editing.intervalN || 1), day: String(editing.day), start: editing.start, end: editing.end, remindDays: String(editing.remindDays), autoPost: editing.autoPost, active: editing.active }
          }
          fields={fields}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            if (editing === "new") await sendJson("/api/finance/rules", "POST", v);
            else await sendJson(`/api/finance/rules/${editing.id}`, "PATCH", v);
            setEditing(null);
            rules.reload();
          }}
        />
      ) : null}

      {editSettings && settings.data ? (
        <EntityForm
          title="提醒設定"
          initial={{ remindOn: settings.data.remindOn, remindTime: settings.data.remindTime, defaultRemindDays: String(settings.data.defaultRemindDays) }}
          fields={[
            { key: "remindOn", label: "開啟 LINE 提醒推播", kind: "check" },
            { key: "defaultRemindDays", label: "貸款、保費預設提前幾天提醒", kind: "number", half: true },
            { key: "remindTime", label: "提醒時間（僅記錄）", kind: "text", half: true, hint: "實際推播時間以 cron-job.org 的排程為準" },
          ]}
          onClose={() => setEditSettings(false)}
          onSubmit={async (v) => {
            await sendJson("/api/finance/settings", "PATCH", { ...v, defaultRemindDays: Number(v.defaultRemindDays) });
            setEditSettings(false);
            settings.reload();
          }}
        />
      ) : null}
    </>
  );
}
