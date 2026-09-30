"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmptyRow,
  LockNotice,
  OnlineSignBadge,
  PageHeader,
  PaymentBadge,
  ReadBadge,
  SearchBox,
} from "@/components/ui";
import { apiFetch, errorText, promptSignLink } from "@/lib/client";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import { PAYMENT_STATUSES, type QuoteSummary } from "@/lib/types";

const COLSPAN = 11;

type Rows = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; quotes: QuoteSummary[] };

export function QuotesView() {
  const router = useRouter();
  const locks = useBusinessLocks();
  const [rows, setRows] = useState<Rows>({ status: "loading" });
  const [payFilter, setPayFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [linkBusy, setLinkBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!locks || locks.quotes) return;
    apiFetch<QuoteSummary[]>("/api/quotes").then(
      (quotes) => setRows({ status: "ok", quotes }),
      (err) => setRows({ status: "error", message: errorText(err) }),
    );
  }, [locks]);

  if (locks?.quotes) {
    return (
      <>
        <PageHeader title="報價單" subtitle="對應 Ragic quotation-system/7" />
        <LockNotice />
      </>
    );
  }

  const all = rows.status === "ok" ? rows.quotes : [];
  const payOf = (q: QuoteSummary) => q.paymentStatus || "未付款";
  const counts: Record<string, number> = { all: all.length };
  for (const s of PAYMENT_STATUSES) counts[s] = all.filter((q) => payOf(q) === s).length;

  // 先套用付款狀態分頁籤，再套用搜尋關鍵字（報價單編號／專案名稱／客戶名稱）
  const term = search.trim().toLowerCase();
  const filtered = all
    .filter((q) => payFilter === "all" || payOf(q) === payFilter)
    .filter((q) => !term || [q.quoteNumber, q.projectName, q.clientName].some((v) => (v || "").toLowerCase().includes(term)));

  return (
    <>
      <PageHeader
        title="報價單"
        subtitle="對應 Ragic quotation-system/7"
        actions={
          locks ? (
            <Link className="btn btn-gold" href="/desktop/quotes/new">
              + 新增報價單
            </Link>
          ) : null
        }
      />

      <div className="card">
        <SearchBox value={search} onChange={setSearch} placeholder="搜尋報價單編號、專案名稱或客戶名稱" />
        <div className="mb-4 flex flex-wrap gap-0.5 border-b-[1.5px] border-line">
          {[["all", "全部"] as const, ...PAYMENT_STATUSES.map((s) => [s, s] as const)].map(([key, label]) => {
            const active = payFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPayFilter(key)}
                className={`flex cursor-pointer items-center gap-[7px] border-b-[2.5px] px-3.5 py-[9px] text-[13px] font-bold hover:text-navy ${
                  active ? "border-navy text-navy" : "border-transparent text-muted"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-[7px] py-px text-[10.5px] font-bold ${
                    active ? "bg-navy text-white" : "bg-[#eaedf0] text-muted"
                  }`}
                >
                  {counts[key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>報價單編號</th>
                <th>報價日期</th>
                <th>客戶</th>
                <th>專案名稱</th>
                <th>未稅金額</th>
                <th>稅額</th>
                <th>總金額含稅</th>
                <th>付款狀態</th>
                <th>已讀追蹤</th>
                <th>線上簽署狀態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.status === "loading" ? (
                <EmptyRow colSpan={COLSPAN}>載入中…</EmptyRow>
              ) : rows.status === "error" ? (
                <EmptyRow colSpan={COLSPAN}>無法載入（{rows.message}）</EmptyRow>
              ) : all.length === 0 ? (
                <EmptyRow colSpan={COLSPAN}>尚無報價單</EmptyRow>
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={COLSPAN}>沒有符合的報價單</EmptyRow>
              ) : (
                // 整列可點擊進入詳情頁；編輯、傳送簽署連結按鈕用 stopPropagation 避免同時觸發
                filtered.map((q) => (
                  <tr key={q.id} className="cursor-pointer" onClick={() => router.push(`/desktop/quotes/${q.id}`)}>
                    <td>
                      <span className="id-chip">{q.quoteNumber || `#${q.id}`}</span>
                    </td>
                    <td>{q.quoteDate}</td>
                    <td>{q.clientName || `#${q.clientId}`}</td>
                    <td>{q.projectName || "—"}</td>
                    <td>{q.untaxedAmount || "—"}</td>
                    <td>{q.taxAmount || "—"}</td>
                    <td className="font-bold">{q.totalAmount || "—"}</td>
                    <td>
                      <PaymentBadge status={q.paymentStatus} />
                    </td>
                    <td>
                      <ReadBadge readAt={q.readAt} />
                    </td>
                    <td>
                      <OnlineSignBadge signerName={q.signerName} signedAt={q.signedAt} />
                    </td>
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Link className="btn btn-outline btn-sm" href={`/desktop/quotes/${q.id}/edit`}>
                        編輯
                      </Link>{" "}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={linkBusy === q.id}
                        onClick={async () => {
                          setLinkBusy(q.id);
                          await promptSignLink("quotes", q.id);
                          setLinkBusy(null);
                        }}
                      >
                        傳送簽署連結
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
