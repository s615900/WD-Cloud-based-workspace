"use client";

import type { AccountWithBalance, FinanceOverview } from "@/lib/financeTypes";
import { ACCOUNT_TYPE } from "@/server/finance/ragicFields";
import s from "./finance.module.css";
import { Msg, money, useApi } from "./shared";

const KIND_ICON: Record<string, string> = { 卡費: "💳", 保費: "🛡️", 貸款: "🏦", 定期: "🔁", 待確認: "❓" };

function whenText(daysLeft: number): string {
  return daysLeft < 0 ? `已逾 ${-daysLeft} 天` : daysLeft === 0 ? "今天" : `${daysLeft} 天後`;
}

// 總覽：本月收支、分類佔比、30 天內待付款、各卡未繳與剩餘額度、貸款、保險、帳戶餘額
export function OverviewTab({ accounts, version }: { accounts: AccountWithBalance[]; version: number }) {
  const ov = useApi<FinanceOverview>("/api/finance/overview", version);
  const d = ov.data;
  const active = accounts.filter((a) => a.active);
  const maxCat = Math.max(1, ...(d?.expenseByCategory.map((c) => c.amount) ?? [1]));

  return (
    <>
      <div className={s.grid3}>
        <div className={s.stat}>
          <div className={s.statLabel}>{d?.month ?? ""} 本月收入</div>
          <div className={`${s.statValue} ${s.income}`} data-testid="ov-income">
            {d ? money(d.summary.income) : "—"}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>本月支出</div>
          <div className={`${s.statValue} ${s.expense}`} data-testid="ov-expense">
            {d ? money(d.summary.expense) : "—"}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>本月結餘</div>
          <div className={s.statValue} data-testid="ov-net">
            {d ? money(d.summary.net) : "—"}
          </div>
        </div>
      </div>
      {ov.error ? <Msg text={ov.error} kind="error" /> : null}

      <div className={s.grid2}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>30 天內待付款</h3>
          {!d ? (
            <p className={s.muted}>讀取中…</p>
          ) : d.dues.length === 0 ? (
            <p className={s.muted}>30 天內沒有待付款項目。</p>
          ) : (
            <div data-testid="ov-dues">
              {d.dues.map((x) => (
                <div key={`${x.kind}-${x.date}-${x.title}`} className={s.balanceRow}>
                  <div>
                    {KIND_ICON[x.kind]} <b>{x.title}</b>
                    <div className={s.sub}>
                      {x.date}・{x.kind}・{whenText(x.daysLeft)}
                      {x.detail ? `・${x.detail}` : ""}
                    </div>
                  </div>
                  <div className={`${s.balanceValue} ${x.daysLeft < 0 ? s.expense : ""}`}>{money(x.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={s.card}>
          <h3 className={s.cardTitle}>帳戶餘額</h3>
          {active.length === 0 ? (
            <p className={s.muted}>還沒有帳戶，請到「帳戶與分類」新增。</p>
          ) : (
            active.map((a) => (
              <div key={a.id} className={s.balanceRow} data-testid={`bal-${a.code}`}>
                <div>
                  <span className={s.balanceName}>{a.name}</span> <span className={s.badge}>{a.type}</span>
                </div>
                <div className={s.balanceValue}>
                  {a.type === ACCOUNT_TYPE.信用卡 ? <span className={s.muted}>未繳 </span> : null}
                  <span data-testid={`bal-value-${a.code}`}>{money(a.balance)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`${s.grid2} ${s.sectionGap}`}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>本月支出分類</h3>
          {!d || d.expenseByCategory.length === 0 ? (
            <p className={s.muted}>本月還沒有支出。</p>
          ) : (
            d.expenseByCategory.map((c) => (
              <div key={c.category} style={{ marginBottom: 10 }}>
                <div className={s.balanceRow} style={{ border: 0, padding: 0 }}>
                  <span>{c.category}</span>
                  <span className={s.mono}>
                    {money(c.amount)} <span className={s.sub}>{((c.amount / Math.max(1, d.summary.expense)) * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <div className={s.bar}>
                  <div className={s.barFill} style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className={s.card}>
          <h3 className={s.cardTitle}>信用卡・貸款・保險</h3>
          {d?.cards.map((c) => (
            <div key={c.account} style={{ marginBottom: 10 }} data-testid={`ov-card-${c.account}`}>
              <div className={s.balanceRow} style={{ border: 0, padding: 0 }}>
                <span>💳 {c.name} 未繳</span>
                <span className={s.mono}>
                  {money(c.unpaid)}
                  {c.usage !== null ? <span className={s.sub}>　{c.shared.length > 1 ? "共用" : ""}剩餘額度 {money(c.remaining)}</span> : null}
                </span>
              </div>
              {c.usage !== null ? (
                <div className={s.bar}>
                  <div className={`${s.barFill} ${c.usage > 0.9 ? s.barBad : c.usage > 0.7 ? s.barWarn : ""}`} style={{ width: `${Math.min(100, Math.max(0, c.usage * 100))}%` }} />
                </div>
              ) : null}
            </div>
          ))}
          {d?.loans.map((l) => (
            <div key={l.code} className={s.balanceRow} data-testid={`ov-loan-${l.code}`}>
              <span>
                🏦 {l.name} <span className={s.sub}>已還 {l.paidPeriods}/{l.periods} 期</span>
              </span>
              <span className={s.mono}>剩餘本金 {money(l.remainingPrincipal)}</span>
            </div>
          ))}
          {d ? (
            <div className={s.balanceRow}>
              <span>🛡️ 今年保費合計</span>
              <span className={s.mono}>
                <span data-testid="ov-ins-annual">{money(d.insurance.annualTotal)}</span>
                {d.insurance.nextPayDate ? <span className={s.sub}>　下次繳費 {d.insurance.nextPayDate}</span> : null}
              </span>
            </div>
          ) : null}
          {d && d.cards.length === 0 && d.loans.length === 0 && d.insurance.annualTotal === 0 ? <p className={s.muted}>還沒有信用卡、貸款或保單資料。</p> : null}
        </div>
      </div>
    </>
  );
}
