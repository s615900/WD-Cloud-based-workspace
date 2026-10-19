"use client";

import { useState } from "react";
import { sendJson } from "@/lib/client";
import type { AccountWithBalance, PolicyView } from "@/lib/financeTypes";
import { INS_FREQ, INS_KIND, INS_PAY_MODE, INS_STATUS } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { EntityForm, Msg, money, opts, useApi } from "./shared";

export function InsuranceTab({
  accounts,
  version,
  onChanged,
}: {
  accounts: AccountWithBalance[];
  version: number;
  onChanged: () => void;
}) {
  const list = useApi<PolicyView[]>("/api/finance/insurance", version);
  const [editing, setEditing] = useState<PolicyView | "new" | null>(null);
  const active = accounts.filter((a) => a.active);
  const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;
  const total = (list.data ?? []).filter((p) => p.status === INS_STATUS.有效).reduce((a, p) => a + p.annualPremium, 0);

  const fields = [
    { key: "product", label: "商品名稱", kind: "text" as const, half: true },
    { key: "company", label: "保險公司", kind: "text" as const, half: true },
    { key: "kind", label: "險種", kind: "select" as const, options: opts(Object.values(INS_KIND)), half: true },
    { key: "status", label: "狀態", kind: "select" as const, options: opts(Object.values(INS_STATUS)), half: true },
    { key: "holder", label: "要保人", kind: "text" as const, half: true },
    { key: "insured", label: "被保險人", kind: "text" as const, half: true },
    { key: "effective", label: "生效日", kind: "date" as const, half: true },
    { key: "freq", label: "繳別", kind: "select" as const, options: opts(Object.values(INS_FREQ)), half: true },
    { key: "premium", label: "每期保費", kind: "number" as const, half: true },
    { key: "payYears", label: "繳費年期（年）", kind: "number" as const, half: true, hint: "0＝未填" },
    { key: "payEnd", label: "繳費終止日", kind: "date" as const, half: true },
    { key: "maturity", label: "滿期日", kind: "date" as const, half: true },
    { key: "payMode", label: "繳費方式", kind: "select" as const, options: opts(Object.values(INS_PAY_MODE)), half: true, hint: "信用卡／轉帳：繳費日自動產生支出；自行繳：不自動入帳，只在總覽列出到期日" },
    {
      key: "account",
      label: "扣款帳戶",
      kind: "select" as const,
      options: active.map((a) => ({ value: a.code, label: `${a.name}（${a.type}）` })),
      half: true,
      show: (v: Record<string, string | boolean>) => v.payMode !== INS_PAY_MODE.自行繳,
    },
    { key: "summary", label: "保障摘要", kind: "textarea" as const },
    { key: "claimContact", label: "理賠聯絡", kind: "text" as const },
    { key: "note", label: "備註", kind: "text" as const },
  ];

  return (
    <>
      <div className={s.toolbar}>
        <span className={s.inlineNote}>
          有效保單年度保費合計 <b data-testid="ins-annual">{money(total)}</b>
        </span>
        <span className={s.spacer} />
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditing("new")}>
          + 新增保單
        </button>
      </div>
      <div className={`${s.card} ${s.tableWrap}`}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>保單</th>
              <th>險種</th>
              <th>繳別</th>
              <th className={s.right}>每期保費</th>
              <th className={s.right}>年度保費</th>
              <th>下次繳費日</th>
              <th>繳費方式</th>
              <th>狀態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!list.data ? (
              <tr>
                <td colSpan={9} className={s.empty}>
                  讀取中…
                </td>
              </tr>
            ) : list.data.length === 0 ? (
              <tr>
                <td colSpan={9} className={s.empty}>
                  還沒有保單
                </td>
              </tr>
            ) : (
              list.data.map((p) => (
                <tr key={p.id} data-testid={`pol-${p.code}`}>
                  <td>
                    {p.product} <span className={s.sub}>{p.company}</span>
                  </td>
                  <td>{p.kind}</td>
                  <td>{p.freq}</td>
                  <td className={s.right}>{money(p.premium)}</td>
                  <td className={s.right}>{money(p.annualPremium)}</td>
                  <td>{p.nextPayDate || <span className={s.muted}>—</span>}</td>
                  <td>
                    {p.payMode}
                    {p.account ? <span className={s.sub}>・{nameOf(p.account)}</span> : null}
                  </td>
                  <td>{p.status}</td>
                  <td className={s.right}>
                    <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditing(p)}>
                      編輯
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {list.error ? <Msg text={list.error} kind="error" /> : null}
      </div>

      {editing ? (
        <EntityForm
          title={editing === "new" ? "新增保單" : `編輯保單 ${editing.code}`}
          initial={
            editing === "new"
              ? { product: "", company: "", kind: INS_KIND.醫療, status: INS_STATUS.有效, holder: "", insured: "", effective: "", freq: INS_FREQ.年繳, premium: "", payYears: "0", payEnd: "", maturity: "", payMode: INS_PAY_MODE.自行繳, account: "", summary: "", claimContact: "", note: "" }
              : { product: editing.product, company: editing.company, kind: editing.kind, status: editing.status, holder: editing.holder, insured: editing.insured, effective: editing.effective, freq: editing.freq, premium: String(editing.premium), payYears: String(editing.payYears), payEnd: editing.payEnd, maturity: editing.maturity, payMode: editing.payMode, account: editing.account, summary: editing.summary, claimContact: editing.claimContact, note: editing.note }
          }
          fields={fields}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            if (editing === "new") await sendJson("/api/finance/insurance", "POST", v);
            else await sendJson(`/api/finance/insurance/${editing.id}`, "PATCH", v);
            setEditing(null);
            list.reload();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
