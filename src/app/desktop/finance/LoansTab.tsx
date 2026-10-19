"use client";

import { useState } from "react";
import { sendJson } from "@/lib/client";
import type { AccountWithBalance, LoanView } from "@/lib/financeTypes";
import { ACCOUNT_TYPE, LOAN_STATUS, LOAN_TYPE, RATE_TYPE, REPAY_MODE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { DeleteButton, EntityForm, Msg, money, opts, useApi } from "./shared";

// 年利率在畫面上用「百分比」輸入（2.85），送出前轉成小數 0.0285（Ragic 存小數，不存 "2.85%"）
const pctToDecimal = (v: unknown) => Number((Number(String(v)) / 100).toFixed(6));
const decimalToPct = (r: number) => String(Number((r * 100).toFixed(4)));

export function LoansTab({
  accounts,
  version,
  onChanged,
}: {
  accounts: AccountWithBalance[];
  version: number;
  onChanged: () => void;
}) {
  const list = useApi<LoanView[]>("/api/finance/loans", version);
  const [editing, setEditing] = useState<LoanView | "new" | null>(null);
  const [rateFor, setRateFor] = useState<LoanView | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const banks = accounts.filter((a) => a.active && a.type !== ACCOUNT_TYPE.信用卡);

  const fields = [
    { key: "name", label: "貸款名稱", kind: "text" as const, half: true },
    { key: "institution", label: "貸款機構", kind: "text" as const, half: true },
    { key: "loanType", label: "貸款類型", kind: "select" as const, options: opts(Object.values(LOAN_TYPE)), half: true },
    { key: "principal", label: "核貸金額", kind: "number" as const, half: true },
    { key: "grantDate", label: "撥款日", kind: "date" as const, half: true },
    { key: "rate", label: "年利率（%）", kind: "number" as const, half: true, hint: "填 2.85 代表 2.85%" },
    { key: "rateType", label: "利率類型", kind: "select" as const, options: opts(Object.values(RATE_TYPE)), half: true },
    { key: "mode", label: "還款方式", kind: "select" as const, options: opts(Object.values(REPAY_MODE)), half: true },
    { key: "periods", label: "期數（月）", kind: "number" as const, half: true },
    { key: "grace", label: "寬限期（月）", kind: "number" as const, half: true, hint: "寬限期內只繳利息" },
    { key: "payDay", label: "每月扣款日", kind: "number" as const, half: true },
    { key: "account", label: "扣款帳戶", kind: "select" as const, options: banks.map((b) => ({ value: b.code, label: b.name })), half: true },
    { key: "status", label: "狀態", kind: "select" as const, options: opts(Object.values(LOAN_STATUS)) },
  ];

  return (
    <>
      <div className={s.toolbar}>
        <span className={s.inlineNote}>攤還表為試算（銀行實際按日計息）；實際扣款不同時，直接修改該筆明細金額即可，攤還表不受影響。</span>
        <span className={s.spacer} />
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditing("new")} disabled={banks.length === 0}>
          + 新增貸款
        </button>
      </div>
      {list.error ? <Msg text={list.error} kind="error" /> : null}
      {!list.data ? (
        <div className={s.notice}>讀取中…</div>
      ) : list.data.length === 0 ? (
        <div className={s.notice}>還沒有貸款</div>
      ) : (
        list.data.map((l) => (
          <div key={l.id} className={s.cardBox} data-testid={`loan-${l.code}`}>
            <div className={s.cardHead}>
              <div>
                <b>{l.name}</b> <span className={s.badge}>{l.loanType}</span> <span className={s.badge}>{l.status}</span>{" "}
                <span className={s.sub}>
                  {l.institution}・{l.mode}・年利率 {decimalToPct(l.rate)}%（{l.rateType}）
                </span>
              </div>
              <div className={s.balanceValue}>
                <span className={s.muted}>剩餘本金 </span>
                <span data-testid={`loan-remaining-${l.code}`}>{money(l.remainingPrincipal)}</span>
              </div>
            </div>
            <p className={s.inlineNote}>
              已還 {l.paidPeriods}/{l.periods} 期・{l.nextDue ? `下次扣款 ${l.nextDue}，約 ${money(l.nextPayment)}` : "已無下期"}・扣款帳戶 {accounts.find((a) => a.code === l.account)?.name ?? l.account}
            </p>
            <div className={s.bar}>
              <div className={s.barFill} style={{ width: `${(l.paidPeriods / Math.max(1, l.periods)) * 100}%` }} />
            </div>
            <div className={s.actions} style={{ justifyContent: "flex-start", marginTop: 10 }}>
              <button className={`${s.btn} ${s.btnSm}`} onClick={() => setOpen(open === l.id ? null : l.id)}>
                {open === l.id ? "收合攤還表" : "攤還表"}
              </button>
              <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditing(l)}>
                編輯
              </button>
              <button className={`${s.btn} ${s.btnSm}`} onClick={() => setRateFor(l)}>
                新增利率異動
              </button>
              <DeleteButton
                url={`/api/finance/loans/${l.id}`}
                onDeleted={() => {
                  list.reload();
                  onChanged();
                }}
              />
            </div>
            {l.rateChanges.length > 0 ? (
              <p className={s.sub}>利率異動：{l.rateChanges.map((r) => `${r.effective} 起 ${decimalToPct(r.rate)}%`).join("、")}</p>
            ) : null}
            {open === l.id ? (
              <div className={s.tableWrap} style={{ marginTop: 8 }}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>期別</th>
                      <th>扣款日</th>
                      <th className={s.right}>每期金額</th>
                      <th className={s.right}>本金</th>
                      <th className={s.right}>利息</th>
                      <th className={s.right}>剩餘本金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.schedule.map((p) => (
                      <tr key={p.k}>
                        <td>{p.k}</td>
                        <td>{p.due}</td>
                        <td className={s.right}>{money(p.payment)}</td>
                        <td className={s.right}>{money(p.principal)}</td>
                        <td className={s.right}>{money(p.interest)}</td>
                        <td className={s.right}>{money(p.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ))
      )}

      {editing ? (
        <EntityForm
          title={editing === "new" ? "新增貸款" : `編輯貸款 ${editing.code}`}
          initial={
            editing === "new"
              ? { name: "", institution: "", loanType: LOAN_TYPE.信貸, principal: "", grantDate: "", rate: "", rateType: RATE_TYPE.固定, mode: REPAY_MODE.本息平均攤還, periods: "", grace: "0", payDay: "", account: banks[0]?.code ?? "", status: LOAN_STATUS.還款中 }
              : { name: editing.name, institution: editing.institution, loanType: editing.loanType, principal: String(editing.principal), grantDate: editing.grantDate, rate: decimalToPct(editing.rate), rateType: editing.rateType, mode: editing.mode, periods: String(editing.periods), grace: String(editing.grace), payDay: String(editing.payDay), account: editing.account, status: editing.status }
          }
          fields={fields}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            const body = { ...v, rate: v.rate === "" ? "" : pctToDecimal(v.rate) };
            if (editing === "new") await sendJson("/api/finance/loans", "POST", body);
            else await sendJson(`/api/finance/loans/${editing.id}`, "PATCH", body);
            setEditing(null);
            list.reload();
            onChanged();
          }}
        />
      ) : null}

      {rateFor ? (
        <EntityForm
          title={`${rateFor.name} 利率異動`}
          initial={{ effective: "", rate: "", note: "" }}
          fields={[
            { key: "effective", label: "生效日", kind: "date", half: true, hint: "該日起的各期改用新利率，並以剩餘本金重算" },
            { key: "rate", label: "新年利率（%）", kind: "number", half: true },
            { key: "note", label: "備註", kind: "text" },
          ]}
          onClose={() => setRateFor(null)}
          onSubmit={async (v) => {
            await sendJson(`/api/finance/loans/${rateFor.id}/rate-changes`, "POST", { ...v, rate: v.rate === "" ? "" : pctToDecimal(v.rate) });
            setRateFor(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}
