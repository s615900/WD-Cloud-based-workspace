"use client";

import { useState } from "react";
import { sendJson } from "@/lib/client";
import type { AccountWithBalance, CardSetting, StatementItem } from "@/lib/financeTypes";
import { ACCOUNT_TYPE, DEBIT_MODE, STMT_STATUS } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { EntityForm, Msg, money, opts, useApi } from "./shared";

function statusPill(status: string): string {
  return status === STMT_STATUS.已繳 ? s.pillOk : status === STMT_STATUS.逾期 ? s.pillBad : s.pillWarn;
}

export function CardsTab({
  accounts,
  version,
  onChanged,
}: {
  accounts: AccountWithBalance[];
  version: number;
  onChanged: () => void;
}) {
  const settings = useApi<CardSetting[]>("/api/finance/cards", version);
  const statements = useApi<StatementItem[]>("/api/finance/statements", version);
  const [editCard, setEditCard] = useState<AccountWithBalance | null>(null);
  const [editStmt, setEditStmt] = useState<StatementItem | null>(null);
  const [payStmt, setPayStmt] = useState<StatementItem | null>(null);

  const cards = accounts.filter((a) => a.type === ACCOUNT_TYPE.信用卡 && a.active);
  const banks = accounts.filter((a) => a.active && a.type !== ACCOUNT_TYPE.信用卡);
  const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;
  const refresh = () => {
    settings.reload();
    statements.reload();
    onChanged();
  };

  return (
    <>
      {cards.length === 0 ? (
        <div className={s.notice}>還沒有信用卡帳戶，請先到「帳戶與分類」新增類型為「信用卡」的帳戶。</div>
      ) : (
        cards.map((c) => {
          const set = settings.data?.find((x) => x.account === c.code);
          const usage = set && set.limit > 0 ? c.balance / set.limit : null;
          return (
            <div key={c.id} className={s.cardBox} data-testid={`card-${c.code}`}>
              <div className={s.cardHead}>
                <div>
                  <b>{c.name}</b> {c.last4 ? <span className={s.sub}>末四碼 {c.last4}</span> : null}
                </div>
                <div className={s.balanceValue}>
                  <span className={s.muted}>目前未繳 </span>
                  {money(c.balance)}
                </div>
              </div>
              {set ? (
                <p className={s.inlineNote}>
                  結帳日 {set.closingDay} 號・繳款截止日 {set.dueDay} 號・額度 {money(set.limit)}・
                  {set.autoDebitAccount ? `自動扣繳 ${nameOf(set.autoDebitAccount)}（${set.debitMode}）` : "手動繳款"}
                </p>
              ) : (
                <p className={s.inlineNote}>尚未設定結帳日／繳款截止日，系統不會產生帳單。</p>
              )}
              {usage !== null ? (
                <div className={s.bar} title={`額度使用率 ${(usage * 100).toFixed(0)}%`}>
                  <div className={`${s.barFill} ${usage > 0.9 ? s.barBad : usage > 0.7 ? s.barWarn : ""}`} style={{ width: `${Math.min(100, Math.max(0, usage * 100))}%` }} />
                </div>
              ) : null}
              <div className={s.actions} style={{ justifyContent: "flex-start", marginTop: 10 }}>
                <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditCard(c)}>
                  {set ? "編輯設定" : "設定結帳日"}
                </button>
                {usage !== null ? <span className={s.sub}>額度使用率 {(usage * 100).toFixed(0)}%</span> : null}
              </div>
            </div>
          );
        })
      )}

      <div className={`${s.card} ${s.tableWrap} ${s.sectionGap}`}>
        <h3 className={s.cardTitle}>帳單</h3>
        <table className={s.table}>
          <thead>
            <tr>
              <th>卡片</th>
              <th>帳單月份</th>
              <th>結帳日</th>
              <th>繳款截止日</th>
              <th className={s.right}>系統試算</th>
              <th className={s.right}>銀行帳單</th>
              <th className={s.right}>對帳差額</th>
              <th className={s.right}>已繳</th>
              <th>狀態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!statements.data ? (
              <tr>
                <td colSpan={10} className={s.empty}>
                  讀取中…
                </td>
              </tr>
            ) : statements.data.length === 0 ? (
              <tr>
                <td colSpan={10} className={s.empty}>
                  還沒有帳單。設定好結帳日後，每日引擎會在結帳日自動產生。
                </td>
              </tr>
            ) : (
              statements.data.map((st) => (
                <tr key={st.id} data-testid={`stmt-${st.code}`}>
                  <td>{nameOf(st.card)}</td>
                  <td>{st.month}</td>
                  <td>{st.closingDate}</td>
                  <td>{st.dueDate}</td>
                  <td className={s.right}>{money(st.systemAmount)}</td>
                  <td className={s.right}>{st.bankAmount === null ? <span className={s.muted}>—</span> : money(st.bankAmount)}</td>
                  <td className={s.right}>{st.diff === null ? <span className={s.muted}>—</span> : money(st.diff)}</td>
                  <td className={s.right}>{money(st.paid)}</td>
                  <td>
                    <span className={`${s.pill} ${statusPill(st.status)}`}>{st.status}</span>
                  </td>
                  <td>
                    <div className={s.actions}>
                      <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditStmt(st)}>
                        填帳單金額
                      </button>
                      {st.status !== STMT_STATUS.已繳 ? (
                        <button className={`${s.btn} ${s.btnSm} ${s.btnPrimary}`} onClick={() => setPayStmt(st)}>
                          繳款
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {statements.error ? <Msg text={statements.error} kind="error" /> : null}
      </div>

      {editCard ? (
        <EntityForm
          title={`${editCard.name} 結帳設定`}
          initial={(() => {
            const set = settings.data?.find((x) => x.account === editCard.code);
            return {
              closingDay: set ? String(set.closingDay) : "",
              dueDay: set ? String(set.dueDay) : "",
              limit: set ? String(set.limit) : "0",
              autoDebitAccount: set?.autoDebitAccount ?? "",
              debitMode: set?.debitMode || DEBIT_MODE.全額,
            };
          })()}
          fields={[
            { key: "closingDay", label: "結帳日（每月幾號）", kind: "number", half: true },
            { key: "dueDay", label: "繳款截止日（每月幾號）", kind: "number", half: true, hint: "小於等於結帳日視為次月" },
            { key: "limit", label: "信用額度", kind: "number", half: true },
            {
              key: "autoDebitAccount",
              label: "自動扣繳帳戶",
              kind: "select",
              options: banks.map((b) => ({ value: b.code, label: b.name })),
              hint: "留空＝手動繳款",
              half: true,
            },
            { key: "debitMode", label: "扣繳方式", kind: "select", options: opts(Object.values(DEBIT_MODE)), half: true },
          ]}
          onClose={() => setEditCard(null)}
          onSubmit={async (v) => {
            await sendJson("/api/finance/cards", "POST", { account: editCard.code, ...v });
            setEditCard(null);
            refresh();
          }}
        />
      ) : null}

      {editStmt ? (
        <EntityForm
          title={`${editStmt.month} 帳單：銀行實際金額`}
          initial={{ bankAmount: editStmt.bankAmount === null ? "" : String(editStmt.bankAmount), minDue: editStmt.minDue === null ? "" : String(editStmt.minDue) }}
          fields={[
            { key: "bankAmount", label: "銀行帳單金額", kind: "number", hint: `系統試算 ${money(editStmt.systemAmount)}；填了以銀行金額為準，留空＝用系統試算`, half: true },
            { key: "minDue", label: "最低應繳", kind: "number", hint: "各銀行算法不同，請手填", half: true },
          ]}
          onClose={() => setEditStmt(null)}
          onSubmit={async (v) => {
            await sendJson(`/api/finance/statements/${editStmt.id}`, "PATCH", v);
            setEditStmt(null);
            refresh();
          }}
        />
      ) : null}

      {payStmt ? (
        <EntityForm
          title={`繳款：${nameOf(payStmt.card)} ${payStmt.month}`}
          submitLabel="確認繳款"
          initial={{ amount: String(payStmt.payable - payStmt.paid), fromAccount: banks[0]?.code ?? "", date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) }}
          fields={[
            { key: "amount", label: "繳款金額", kind: "number", hint: `未繳 ${money(payStmt.payable - payStmt.paid)}；繳卡費是轉帳，不會再算一次支出`, half: true },
            { key: "date", label: "繳款日", kind: "date", half: true },
            { key: "fromAccount", label: "從哪個帳戶繳", kind: "select", options: banks.map((b) => ({ value: b.code, label: b.name })) },
          ]}
          onClose={() => setPayStmt(null)}
          onSubmit={async (v) => {
            await sendJson(`/api/finance/statements/${payStmt.id}/pay`, "POST", { ...v, amount: Number(v.amount) });
            setPayStmt(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
