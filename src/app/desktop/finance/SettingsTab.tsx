"use client";

import { useState } from "react";
import { apiFetch, errorText, sendJson, todayISO } from "@/lib/client";
import type { AccountItem, AccountType, AccountWithBalance, BudgetItem, CategoryItem, CategoryKind, CategoryNature, SeedResult } from "@/lib/financeTypes";
import { ACCOUNT_TYPE, BUDGET_ALL, CATEGORY_KIND, CATEGORY_NATURE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { RulesPanel } from "./RulesPanel";
import { DeleteButton, Field, FinModal, Msg, money, useApi } from "./shared";

export function SettingsTab({
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
  const [editAccount, setEditAccount] = useState<AccountItem | "new" | null>(null);
  const [editCategory, setEditCategory] = useState<CategoryItem | "new" | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);

  return (
    <>
      <div className={s.card}>
        <div className={s.toolbar}>
          <h3 className={s.cardTitle} style={{ margin: 0 }}>
            帳戶
          </h3>
          <span className={s.spacer} />
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditAccount("new")}>
            + 新增帳戶
          </button>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>編號</th>
                <th>名稱</th>
                <th>類型</th>
                <th>末四碼</th>
                <th className={s.right}>期初餘額</th>
                <th>期初日期</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className={s.empty}>
                    還沒有帳戶
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.id} data-testid={`acc-${a.code}`}>
                    <td>{a.code}</td>
                    <td>
                      {a.name} {a.isDefault ? <span className={s.badge}>預設記帳</span> : null}
                    </td>
                    <td>{a.type}</td>
                    <td>{a.last4 || <span className={s.muted}>—</span>}</td>
                    <td className={s.right}>{money(a.openingBalance)}</td>
                    <td>{a.openingDate}</td>
                    <td>{a.active ? "啟用" : <span className={s.muted}>停用</span>}</td>
                    <td>
                      <div className={s.actions}>
                        <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditAccount(a)}>
                          編輯
                        </button>
                        <DeleteButton url={`/api/finance/accounts/${a.id}`} onDeleted={onChanged} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${s.card} ${s.sectionGap}`}>
        <div className={s.toolbar}>
          <h3 className={s.cardTitle} style={{ margin: 0 }}>
            收支分類
          </h3>
          <span className={s.spacer} />
          <button className={s.btn} onClick={() => setSeedOpen(true)}>
            建立預設分類
          </button>
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditCategory("new")}>
            + 新增分類
          </button>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>名稱</th>
                <th>收支別</th>
                <th>支出性質</th>
                <th>排序</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={6} className={s.empty}>
                    還沒有分類，可以按「建立預設分類」
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} data-testid={`cat-${c.name}`}>
                    <td>{c.name}</td>
                    <td>{c.kind}</td>
                    <td>{c.kind === CATEGORY_KIND.支出 ? c.nature : <span className={s.muted}>—</span>}</td>
                    <td>{c.order}</td>
                    <td>{c.active ? "啟用" : <span className={s.muted}>停用</span>}</td>
                    <td className={s.right}>
                      <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditCategory(c)}>
                        編輯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BudgetPanel categories={categories} version={version} onChanged={onChanged} />

      <RulesPanel accounts={accounts} categories={categories} version={version} onChanged={onChanged} />

      {editAccount ? (
        <AccountForm
          key={editAccount === "new" ? "new" : editAccount.id}
          editing={editAccount === "new" ? null : editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={() => {
            setEditAccount(null);
            onChanged();
          }}
        />
      ) : null}
      {editCategory ? (
        <CategoryForm
          key={editCategory === "new" ? "new" : editCategory.id}
          editing={editCategory === "new" ? null : editCategory}
          onClose={() => setEditCategory(null)}
          onSaved={() => {
            setEditCategory(null);
            onChanged();
          }}
        />
      ) : null}
      {seedOpen ? (
        <SeedDialog
          onClose={() => setSeedOpen(false)}
          onDone={() => {
            setSeedOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

const ACCOUNT_TYPES: AccountType[] = [ACCOUNT_TYPE.銀行, ACCOUNT_TYPE.現金, ACCOUNT_TYPE.電子支付, ACCOUNT_TYPE.信用卡];

function AccountForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: AccountItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(editing?.code ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<AccountType>(editing?.type ?? ACCOUNT_TYPE.現金);
  const [institution, setInstitution] = useState(editing?.institution ?? "");
  const [last4, setLast4] = useState(editing?.last4 ?? "");
  const [openingBalance, setOpeningBalance] = useState(editing ? String(editing.openingBalance) : "0");
  const [openingDate, setOpeningDate] = useState(editing?.openingDate ?? todayISO());
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false);
  const [active, setActive] = useState(editing?.active ?? true);
  const [note, setNote] = useState(editing?.note ?? "");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const body = {
      code,
      name,
      type,
      institution,
      last4,
      openingBalance: openingBalance === "" ? "" : Number(openingBalance),
      openingDate,
      isDefault,
      active,
      note,
    };
    try {
      if (editing) await sendJson(`/api/finance/accounts/${editing.id}`, "PATCH", body);
      else await sendJson("/api/finance/accounts", "POST", body);
      onSaved();
    } catch (err) {
      setMsg(errorText(err, "儲存失敗"));
      setSaving(false);
    }
  }

  return (
    <FinModal title={editing ? `編輯帳戶 ${editing.code}` : "新增帳戶"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className={s.row2}>
          <Field label="帳戶編號" hint={editing ? "建立後不能修改" : "例：AC-001"}>
            <input
              className={s.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={editing !== null}
              aria-label="帳戶編號"
            />
          </Field>
          <Field label="帳戶名稱">
            <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} aria-label="帳戶名稱" />
          </Field>
        </div>
        <div className={s.row2}>
          <Field label="帳戶類型">
            <select
              className={s.select}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              aria-label="帳戶類型"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="機構">
            <input className={s.input} value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Field>
        </div>
        <div className={s.row2}>
          <Field label="末四碼" hint="只存末四碼，不要填完整卡號／帳號">
            <input
              className={s.input}
              value={last4}
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setLast4(e.target.value)}
              aria-label="末四碼"
            />
          </Field>
          <Field label="期初日期">
            <input
              className={s.input}
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              aria-label="期初日期"
            />
          </Field>
        </div>
        <Field
          label={type === ACCOUNT_TYPE.信用卡 ? "期初餘額（期初未繳，欠款記正數）" : "期初餘額"}
          hint="餘額從期初日期起算"
        >
          <input
            className={s.input}
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            aria-label="期初餘額"
          />
        </Field>
        <Field label="備註">
          <input className={s.input} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className={s.field}>
          <label className={s.check}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            預設記帳（限一個）
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            啟用
          </label>
        </div>
        <Msg text={msg} kind="error" />
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

function CategoryForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: CategoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(editing?.kind ?? CATEGORY_KIND.支出);
  const [nature, setNature] = useState<CategoryNature>(editing?.nature ?? CATEGORY_NATURE.彈性);
  const [order, setOrder] = useState(editing ? String(editing.order) : "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    const body = { name, kind, nature, order, active };
    try {
      if (editing) await sendJson(`/api/finance/categories/${editing.id}`, "PATCH", body);
      else await sendJson("/api/finance/categories", "POST", body);
      onSaved();
    } catch (err) {
      setMsg(errorText(err, "儲存失敗"));
      setSaving(false);
    }
  }

  return (
    <FinModal title={editing ? "編輯分類" : "新增分類"} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className={s.row2}>
          <Field label="分類名稱" hint={editing ? "已有明細使用時不能改名" : undefined}>
            <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} aria-label="分類名稱" />
          </Field>
          <Field label="收支別">
            <select className={s.select} value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)} aria-label="收支別">
              <option value={CATEGORY_KIND.收入}>{CATEGORY_KIND.收入}</option>
              <option value={CATEGORY_KIND.支出}>{CATEGORY_KIND.支出}</option>
            </select>
          </Field>
        </div>
        {kind === CATEGORY_KIND.支出 ? (
          <Field label="支出性質" hint="固定＝房租、訂閱這類每月差不多的花費；彈性＝可以省的花費">
            <select className={s.select} value={nature} onChange={(e) => setNature(e.target.value as CategoryNature)} aria-label="支出性質">
              <option value={CATEGORY_NATURE.固定}>{CATEGORY_NATURE.固定}</option>
              <option value={CATEGORY_NATURE.彈性}>{CATEGORY_NATURE.彈性}</option>
            </select>
          </Field>
        ) : null}
        <Field label="排序" hint="數字小的在前；新增時留空會排到最後">
          <input className={s.input} type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
        <label className={s.check}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          啟用
        </label>
        <Msg text={msg} kind="error" />
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

// 先 dryRun 預覽，使用者確認後才真的寫入
function SeedDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<SeedResult | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind?: "error" | "ok" }>({ text: "" });
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function loadPreview() {
    setBusy(true);
    setMsg({ text: "" });
    try {
      setPreview(await apiFetch<SeedResult>("/api/finance/categories/seed?dryRun=1", { method: "POST" }));
    } catch (err) {
      setMsg({ text: errorText(err, "預覽失敗"), kind: "error" });
    }
    setBusy(false);
  }

  if (!started) {
    setStarted(true);
    void loadPreview();
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await apiFetch<SeedResult>("/api/finance/categories/seed", { method: "POST" });
      setMsg({ text: `已新增 ${res.toCreate.length} 筆分類`, kind: "ok" });
      setPreview(null);
      setTimeout(onDone, 600);
    } catch (err) {
      setMsg({ text: errorText(err, "建立失敗"), kind: "error" });
      setBusy(false);
    }
  }

  return (
    <FinModal title="建立預設分類" onClose={onClose}>
      {preview ? (
        <>
          <p data-testid="seed-summary">
            預覽：將新增 <b>{preview.toCreate.length}</b> 筆，已存在跳過 <b>{preview.skipped.length}</b> 筆。
          </p>
          {preview.toCreate.length > 0 ? (
            <div className={s.seedList}>
              {preview.toCreate.map((c) => (
                <span key={c.name} className={s.badge}>
                  {c.kind}｜{c.name}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className={s.muted}>{busy ? "處理中…" : ""}</p>
      )}
      <Msg text={msg.text} kind={msg.kind} />
      <div className={s.modalActions}>
        <button className={s.btn} onClick={onClose}>
          關閉
        </button>
        <button
          className={`${s.btn} ${s.btnPrimary}`}
          onClick={confirm}
          disabled={busy || !preview || preview.toCreate.length === 0}
        >
          確認建立
        </button>
      </div>
    </FinModal>
  );
}

// 每月預算：每個支出分類（和「全部」）各一格，留空＝不設限
function BudgetPanel({ categories, version, onChanged }: { categories: CategoryItem[]; version: number; onChanged: () => void }) {
  const budgets = useApi<BudgetItem[]>("/api/finance/budgets", version);
  const targets = [BUDGET_ALL, ...categories.filter((c) => c.active && c.kind === CATEGORY_KIND.支出).map((c) => c.name)];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const saved = (t: string) => String(budgets.data?.find((b) => b.target === t)?.limit ?? "");

  async function save(target: string) {
    setBusy(target);
    setMsg("");
    try {
      await sendJson("/api/finance/budgets", "POST", { target, amount: draft[target] ?? saved(target) });
      setDraft((d) => {
        const next = { ...d };
        delete next[target];
        return next;
      });
      budgets.reload();
      onChanged();
    } catch (err) {
      setMsg(errorText(err, "儲存失敗"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={`${s.card} ${s.sectionGap}`}>
      <h3 className={s.cardTitle}>每月預算</h3>
      <p className={s.sub} style={{ marginTop: 0 }}>
        每個月都用同一個上限；留空代表不設限。「全部」是整體預算。
      </p>
      <Msg text={msg} kind="error" />
      <div className={s.tableWrap}>
        <table className={s.table}>
          <tbody>
            {targets.map((t) => {
              const value = draft[t] ?? saved(t);
              const dirty = value !== saved(t);
              return (
                <tr key={t} data-testid={`budget-${t}`}>
                  <td>{t === BUDGET_ALL ? <b>全部</b> : t}</td>
                  <td>
                    <input
                      className={s.input}
                      type="number"
                      min={0}
                      step={1}
                      placeholder="不設限"
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [t]: e.target.value }))}
                      aria-label={`${t}每月預算`}
                    />
                  </td>
                  <td className={s.right}>
                    <button className={`${s.btn} ${s.btnSm}`} disabled={!dirty || busy === t} onClick={() => save(t)}>
                      {busy === t ? "儲存中…" : "儲存"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
