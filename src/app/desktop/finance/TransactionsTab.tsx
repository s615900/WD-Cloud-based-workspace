"use client";

import { useEffect, useState } from "react";
import { addMonths, apiFetch, currentMonth, errorText, sendJson, todayISO } from "@/lib/client";
import type { AccountWithBalance, CategoryItem, TransactionItem, TransactionList, TxType } from "@/lib/financeTypes";
import { TX_SOURCE, TX_STATUS, TX_TYPE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { Field, FinModal, Msg, money } from "./shared";

const TYPES: TxType[] = [TX_TYPE.支出, TX_TYPE.收入, TX_TYPE.轉帳];

function amountClass(type: TxType): string {
  return type === TX_TYPE.收入 ? s.income : type === TX_TYPE.支出 ? s.expense : s.transfer;
}

export function TransactionsTab({
  accounts,
  categories,
  onChanged,
  version,
}: {
  accounts: AccountWithBalance[];
  categories: CategoryItem[];
  onChanged: () => void;
  version: number;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [account, setAccount] = useState("");
  const [list, setList] = useState<TransactionList | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<TransactionItem | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ month });
    if (account) q.set("account", account);
    apiFetch<TransactionList>(`/api/finance/transactions?${q}`).then(
      (data) => {
        if (!alive) return;
        setList(data);
        setError("");
      },
      (err) => alive && setError(errorText(err, "讀取失敗")),
    );
    return () => {
      alive = false;
    };
  }, [month, account, version]);

  const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;

  async function confirm(id: string) {
    try {
      await apiFetch(`/api/finance/transactions/${id}/confirm`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(errorText(err, "確認失敗"));
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/finance/transactions/${id}`, { method: "DELETE" });
      setConfirmId(null);
      onChanged();
    } catch (err) {
      setError(errorText(err, "刪除失敗"));
    }
  }

  const sum = list?.summary;

  return (
    <>
      <div className={s.toolbar}>
        <button className={s.btn} onClick={() => setMonth(addMonths(month, -1))}>
          ← 上一月
        </button>
        <span className={s.monthLabel} data-testid="month-label">
          {month}
        </span>
        <button className={s.btn} onClick={() => setMonth(currentMonth())}>
          本月
        </button>
        <button className={s.btn} onClick={() => setMonth(addMonths(month, 1))}>
          下一月 →
        </button>
        <select
          className={`${s.select} ${s.inline}`}
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          aria-label="帳戶篩選"
        >
          <option value="">全部帳戶</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.code}>
              {a.name}
            </option>
          ))}
        </select>
        <span className={s.spacer} />
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditing("new")} disabled={accounts.length === 0}>
          + 新增收支
        </button>
      </div>

      <div className={s.grid3}>
        <div className={s.stat}>
          <div className={s.statLabel}>收入</div>
          <div className={`${s.statValue} ${s.income}`} data-testid="sum-income">
            {sum ? money(sum.income) : "—"}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>支出</div>
          <div className={`${s.statValue} ${s.expense}`} data-testid="sum-expense">
            {sum ? money(sum.expense) : "—"}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>結餘（不含轉帳）</div>
          <div className={s.statValue} data-testid="sum-net">
            {sum ? money(sum.net) : "—"}
          </div>
        </div>
      </div>
      {error ? <Msg text={error} kind="error" /> : null}

      <div className={`${s.card} ${s.tableWrap}`}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>日期</th>
              <th>類型</th>
              <th>分類</th>
              <th>摘要</th>
              <th>帳戶</th>
              <th className={s.right}>金額</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!list ? (
              <tr>
                <td colSpan={7} className={s.empty}>
                  讀取中…
                </td>
              </tr>
            ) : list.items.length === 0 ? (
              <tr>
                <td colSpan={7} className={s.empty}>
                  這個月沒有收支明細
                </td>
              </tr>
            ) : (
              list.items.map((t) => (
                <tr key={t.id} data-testid={`tx-${t.code}`}>
                  <td className={s.right}>{t.date}</td>
                  <td>{t.type}</td>
                  <td>{t.category || <span className={s.muted}>—</span>}</td>
                  <td>{t.summary}</td>
                  <td>{t.type === TX_TYPE.轉帳 ? `${nameOf(t.account)} → ${nameOf(t.toAccount)}` : nameOf(t.account)}</td>
                  <td className={`${s.right} ${amountClass(t.type)}`}>{money(t.amount)}</td>
                  <td>
                    <div className={s.actions}>
                      {t.status === TX_STATUS.預定 ? <span className={`${s.pill} ${s.pillWarn}`}>預定</span> : null}
                      {t.source !== TX_SOURCE.手動 ? <span className={s.badge}>{t.source || "非手動"}</span> : null}
                      {t.status === TX_STATUS.預定 ? (
                        <button className={`${s.btn} ${s.btnSm} ${s.btnPrimary}`} onClick={() => confirm(t.id)}>
                          確認入帳
                        </button>
                      ) : null}
                      <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditing(t)}>
                        編輯
                      </button>
                      {t.source === TX_SOURCE.手動 ? (
                        confirmId === t.id ? (
                          <>
                            <button className={`${s.btn} ${s.btnSm} ${s.btnDanger}`} onClick={() => remove(t.id)}>
                              確定刪除
                            </button>
                            <button className={`${s.btn} ${s.btnSm}`} onClick={() => setConfirmId(null)}>
                              取消
                            </button>
                          </>
                        ) : (
                          <button className={`${s.btn} ${s.btnSm} ${s.btnDanger}`} onClick={() => setConfirmId(t.id)}>
                            刪除
                          </button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <TransactionForm
          key={editing === "new" ? "new" : editing.id}
          editing={editing === "new" ? null : editing}
          month={month}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function TransactionForm({
  editing,
  month,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  editing: TransactionItem | null;
  month: string;
  accounts: AccountWithBalance[];
  categories: CategoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const activeAccounts = accounts.filter((a) => a.active);
  const defaultAccount = (activeAccounts.find((a) => a.isDefault) ?? activeAccounts[0])?.code ?? "";
  const today = todayISO();

  const [type, setType] = useState<TxType>(editing?.type ?? TX_TYPE.支出);
  const [date, setDate] = useState(editing?.date ?? (today.startsWith(month) ? today : `${month}-01`));
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [account, setAccount] = useState(editing?.account ?? defaultAccount);
  const [toAccount, setToAccount] = useState(editing?.toAccount ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [summary, setSummary] = useState(editing?.summary ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [msg, setMsg] = useState<{ text: string; kind?: "error" | "ok" }>({ text: "" });
  const [saving, setSaving] = useState(false);

  const isTransfer = type === TX_TYPE.轉帳;
  // 分類只列對應收支別、且啟用的（編輯時保留原本的分類，即使它後來被停用）
  const categoryOptions = categories.filter((c) => c.kind === type && (c.active || c.name === editing?.category));
  // 帳戶下拉只列啟用帳戶（編輯時保留原本的）
  const accountOptions = accounts.filter((a) => a.active || a.code === editing?.account);
  const toOptions = accounts.filter((a) => a.active || a.code === editing?.toAccount);

  function changeType(next: TxType) {
    setType(next);
    if (!categories.some((c) => c.kind === next && c.name === category)) setCategory("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: "" });
    const body = {
      date,
      type,
      amount: amount === "" ? "" : Number(amount),
      account,
      toAccount: isTransfer ? toAccount : "",
      category: isTransfer ? "" : category,
      summary,
      note,
    };
    try {
      if (editing) await sendJson(`/api/finance/transactions/${editing.id}`, "PATCH", body);
      else await sendJson("/api/finance/transactions", "POST", body);
      onSaved();
    } catch (err) {
      setMsg({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <FinModal title={editing ? `編輯收支 ${editing.code}` : "新增收支"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="類型">
          <div className={s.seg}>
            {TYPES.map((t) => (
              <button key={t} type="button" className={s.segBtn} aria-pressed={type === t} onClick={() => changeType(t)}>
                {t}
              </button>
            ))}
          </div>
        </Field>
        <div className={s.row2}>
          <Field label="日期">
            <input className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="金額（整數）">
            <input
              className={s.input}
              type="number"
              inputMode="numeric"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="金額"
            />
          </Field>
        </div>
        <div className={s.row2}>
          <Field label={isTransfer ? "轉出帳戶" : "帳戶"}>
            <select className={s.select} value={account} onChange={(e) => setAccount(e.target.value)} aria-label="帳戶">
              <option value="">請選擇</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          {isTransfer ? (
            <Field label="轉入帳戶">
              <select
                className={s.select}
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
                aria-label="轉入帳戶"
              >
                <option value="">請選擇</option>
                {toOptions.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="分類">
              <select className={s.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="分類">
                <option value="">請選擇</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="摘要">
          <input className={s.input} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="摘要" />
        </Field>
        <Field label="備註">
          <input className={s.input} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Msg text={msg.text} kind={msg.kind} />
        <div className={s.modalActions}>
          <button type="button" className={s.btn} onClick={onClose}>
            取消
          </button>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </form>
    </FinModal>
  );
}
