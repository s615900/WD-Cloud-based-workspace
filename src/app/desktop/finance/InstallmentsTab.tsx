"use client";

import { useState } from "react";
import { sendJson } from "@/lib/client";
import type { AccountWithBalance, CategoryItem, InstallmentItem } from "@/lib/financeTypes";
import { ACCOUNT_TYPE, CATEGORY_KIND, INST_STATUS, REMAINDER_MODE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { EntityForm, Msg, money, opts, useApi } from "./shared";

export function InstallmentsTab({
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
  const list = useApi<InstallmentItem[]>("/api/finance/installments", version);
  const [editing, setEditing] = useState<InstallmentItem | "new" | null>(null);
  const cards = accounts.filter((a) => a.type === ACCOUNT_TYPE.信用卡 && a.active);
  const expenseCats = categories.filter((c) => c.kind === CATEGORY_KIND.支出 && c.active);
  const nameOf = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;

  const common = [
    { key: "item", label: "品項", kind: "text" as const },
    { key: "category", label: "分類", kind: "select" as const, options: expenseCats.map((c) => ({ value: c.name, label: c.name })), half: true },
  ];

  return (
    <>
      <div className={s.toolbar}>
        <span className={s.inlineNote}>分期每期各計入當期支出（不是刷卡當下一次全額），在信用卡結帳日自動產生。</span>
        <span className={s.spacer} />
        <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => setEditing("new")} disabled={cards.length === 0}>
          + 新增分期
        </button>
      </div>
      <div className={`${s.card} ${s.tableWrap}`}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>編號</th>
              <th>品項</th>
              <th>卡片</th>
              <th>消費日</th>
              <th className={s.right}>總金額</th>
              <th>期數</th>
              <th className={s.right}>每期（首期／其餘）</th>
              <th>首期帳單</th>
              <th>已入帳</th>
              <th className={s.right}>剩餘金額</th>
              <th>狀態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!list.data ? (
              <tr>
                <td colSpan={12} className={s.empty}>
                  讀取中…
                </td>
              </tr>
            ) : list.data.length === 0 ? (
              <tr>
                <td colSpan={12} className={s.empty}>
                  還沒有分期
                </td>
              </tr>
            ) : (
              list.data.map((i) => (
                <tr key={i.id} data-testid={`inst-${i.code}`}>
                  <td>{i.code}</td>
                  <td>{i.item}</td>
                  <td>{nameOf(i.card)}</td>
                  <td>{i.purchaseDate}</td>
                  <td className={s.right}>{money(i.total + i.fee)}</td>
                  <td>{i.periods}</td>
                  <td className={s.right}>
                    {money(i.amounts[0] ?? 0)}／{money(i.amounts[1] ?? i.amounts[0] ?? 0)}
                  </td>
                  <td>{i.firstBillMonth}</td>
                  <td>
                    {i.posted}/{i.periods}
                  </td>
                  <td className={s.right}>{money(i.remaining)}</td>
                  <td>
                    <span className={`${s.pill} ${i.status === INST_STATUS.進行中 ? s.pillWarn : s.pillOk}`}>{i.status}</span>
                  </td>
                  <td className={s.right}>
                    <button className={`${s.btn} ${s.btnSm}`} onClick={() => setEditing(i)}>
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

      {editing === "new" ? (
        <EntityForm
          title="新增信用卡分期"
          initial={{ card: cards[0]?.code ?? "", item: "", category: "", purchaseDate: "", total: "", periods: "3", firstBillMonth: "", remainderAt: REMAINDER_MODE.首期, fee: "0", note: "" }}
          fields={[
            { key: "card", label: "信用卡", kind: "select", options: cards.map((c) => ({ value: c.code, label: c.name })) },
            ...common,
            { key: "purchaseDate", label: "消費日", kind: "date", half: true },
            { key: "firstBillMonth", label: "首期帳單月份", kind: "month", half: true, hint: "留空＝依結帳日由消費日推算" },
            { key: "total", label: "總金額", kind: "number", half: true },
            { key: "periods", label: "期數", kind: "number", half: true },
            { key: "fee", label: "手續費總額", kind: "number", half: true },
            { key: "remainderAt", label: "尾差放在", kind: "select", options: opts(Object.values(REMAINDER_MODE)), half: true },
            { key: "note", label: "備註", kind: "text" },
          ]}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await sendJson("/api/finance/installments", "POST", v);
            setEditing(null);
            list.reload();
            onChanged();
          }}
        />
      ) : editing ? (
        <EntityForm
          title={`編輯分期 ${editing.code}`}
          initial={{ item: editing.item, category: editing.category, status: editing.status, earlyDate: editing.earlyDate, note: editing.note }}
          fields={[
            ...common,
            { key: "status", label: "狀態", kind: "select", options: opts(Object.values(INST_STATUS)), half: true },
            { key: "earlyDate", label: "提前清償日", kind: "date", half: true, hint: "狀態改為「提前清償」後，後續各期不再入帳" },
            { key: "note", label: "備註", kind: "text" },
          ]}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await sendJson(`/api/finance/installments/${editing.id}`, "PATCH", v);
            setEditing(null);
            list.reload();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
