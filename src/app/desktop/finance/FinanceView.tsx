"use client";

// 個人財務：總覽｜收支明細｜信用卡｜分期｜貸款｜保險｜帳戶與分類（含定期規則、每日引擎）。
import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorText } from "@/lib/client";
import type { AccountWithBalance, CategoryItem } from "@/lib/financeTypes";
import s from "./finance.module.css";
import { CardsTab } from "./CardsTab";
import { InstallmentsTab } from "./InstallmentsTab";
import { InsuranceTab } from "./InsuranceTab";
import { LoansTab } from "./LoansTab";
import { OverviewTab } from "./OverviewTab";
import { SettingsTab } from "./SettingsTab";
import { TransactionsTab } from "./TransactionsTab";

type TabKey = "overview" | "transactions" | "cards" | "installments" | "loans" | "insurance" | "settings";

const TABS: { key: TabKey; label: string; open: boolean }[] = [
  { key: "overview", label: "總覽", open: true },
  { key: "transactions", label: "收支明細", open: true },
  { key: "cards", label: "信用卡", open: true },
  { key: "installments", label: "分期", open: true },
  { key: "loans", label: "貸款", open: true },
  { key: "insurance", label: "保險", open: true },
  { key: "settings", label: "帳戶與分類", open: true },
];

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; accounts: AccountWithBalance[]; categories: CategoryItem[] };

export function FinanceView() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // 任何寫入之後 +1，讓各分頁重新抓資料（餘額會變）
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<AccountWithBalance[]>("/api/finance/accounts"),
      apiFetch<CategoryItem[]>("/api/finance/categories?all=1"),
    ]).then(
      ([accounts, categories]) => alive && setLoad({ status: "ok", accounts, categories }),
      (err) => alive && setLoad({ status: "error", message: errorText(err, "讀取失敗") }),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const current = TABS.find((t) => t.key === tab);

  return (
    <div className={s.root}>
      <h1 className={s.title}>財務</h1>
      <p className={s.subtitle}>個人帳戶、收支與餘額（個人帳，與接案帳分開）</p>

      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`${s.tab} ${t.open ? "" : s.tabDisabled}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!current?.open ? (
        <div className={s.notice}>「{current?.label}」尚未開放</div>
      ) : load.status === "loading" ? (
        <div className={s.notice}>讀取中…</div>
      ) : load.status === "error" ? (
        <div className={s.notice}>
          <p>{load.message}</p>
          <button className={s.btn} onClick={changed}>
            重試
          </button>
        </div>
      ) : tab === "overview" ? (
        <OverviewTab accounts={load.accounts} version={version} />
      ) : tab === "transactions" ? (
        <TransactionsTab accounts={load.accounts} categories={load.categories} onChanged={changed} version={version} />
      ) : tab === "cards" ? (
        <CardsTab accounts={load.accounts} version={version} onChanged={changed} />
      ) : tab === "installments" ? (
        <InstallmentsTab accounts={load.accounts} categories={load.categories} version={version} onChanged={changed} />
      ) : tab === "loans" ? (
        <LoansTab accounts={load.accounts} version={version} onChanged={changed} />
      ) : tab === "insurance" ? (
        <InsuranceTab accounts={load.accounts} version={version} onChanged={changed} />
      ) : (
        <SettingsTab accounts={load.accounts} categories={load.categories} onChanged={changed} version={version} />
      )}
    </div>
  );
}
