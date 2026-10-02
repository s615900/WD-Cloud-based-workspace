"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyRow, LockNotice, PageHeader } from "@/components/ui";
import { apiFetch, errorText, formatCurrency, promptSignLink } from "@/lib/client";
import { displayContractStatus, isContentLocked } from "@/lib/contractStatus";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import type { ContractSummary } from "@/lib/types";

function SignedBadge({ signedAt }: { signedAt: string }) {
  return signedAt ? <span className="badge badge-teal">✓ 已簽署</span> : <span className="badge badge-muted">未簽署</span>;
}

type Rows = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; contracts: ContractSummary[] };

export function ContractsView() {
  const router = useRouter();
  const locks = useBusinessLocks();
  const [rows, setRows] = useState<Rows>({ status: "loading" });

  useEffect(() => {
    if (!locks || locks.contracts) return;
    apiFetch<ContractSummary[]>("/api/contracts").then(
      (contracts) => setRows({ status: "ok", contracts }),
      (err) => setRows({ status: "error", message: errorText(err) }),
    );
  }, [locks]);

  // 客戶已簽名的合約是正式文件，只能作廢、不能刪除（伺服器端也會擋）
  async function remove(c: ContractSummary) {
    if (!confirm(`確定刪除合約 ${c.contractNumber || `#${c.id}`}？此動作無法復原。`)) return;
    try {
      await apiFetch(`/api/contracts/${c.id}`, { method: "DELETE" });
      setRows((r) => (r.status === "ok" ? { status: "ok", contracts: r.contracts.filter((x) => x.id !== c.id) } : r));
    } catch (err) {
      alert(errorText(err, "刪除失敗"));
    }
  }

  const header = (
    <PageHeader
      title="合約"
      subtitle="對應 Ragic quotation-system/12・狀態依雙方簽署情況自動更新"
      actions={
        locks && !locks.contracts ? (
          <Link className="btn btn-gold" href="/desktop/contracts/new">
            + 新增合約
          </Link>
        ) : null
      }
    />
  );

  if (locks?.contracts) {
    return (
      <>
        {header}
        <LockNotice />
      </>
    );
  }

  return (
    <>
      {header}
      {/* 手機／平板：卡片清單 */}
      <div className="flex flex-col gap-2.5 xl:hidden">
        {rows.status === "loading" ? (
          <p className="empty-hint">載入中…</p>
        ) : rows.status === "error" ? (
          <p className="empty-hint">無法載入（{rows.message}）</p>
        ) : rows.contracts.length === 0 ? (
          <p className="empty-hint">尚無合約</p>
        ) : (
          rows.contracts.map((c) => {
            const status = displayContractStatus(c);
            return (
              <div key={c.id} className="list-card">
                <Link href={`/desktop/contracts/${c.id}`} className="block text-inherit no-underline">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="id-chip">{c.contractNumber || `#${c.id}`}</span>
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                    {c.nda && <span className="badge badge-gold">含 NDA</span>}
                  </div>
                  <div className="font-bold">{c.clientName}</div>
                  <div className="mb-1.5 text-[13px] text-muted">報價單 {c.quoteNumber || "—"}</div>
                  <div className="list-card-row">
                    <span>合約金額</span>
                    <span className="font-bold">{formatCurrency(c.amount)}</span>
                  </div>
                  <div className="list-card-row">
                    <span>簽署</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      <span className={`badge ${c.customerSignedAt ? "badge-teal" : "badge-muted"}`}>
                        客戶{c.customerSignedAt ? "已簽" : "未簽"}
                      </span>
                      <span className={`badge ${c.staffSignedAt ? "badge-teal" : "badge-muted"}`}>
                        負責人{c.staffSignedAt ? "已簽" : "未簽"}
                      </span>
                    </span>
                  </div>
                </Link>
                {!isContentLocked(c) && (
                  <div className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
                    {c.status !== "作廢" && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm flex-1"
                        onClick={async () => {
                          await promptSignLink("contracts", c.id);
                          apiFetch<ContractSummary[]>("/api/contracts").then(
                            (contracts) => setRows({ status: "ok", contracts }),
                            () => {},
                          );
                        }}
                      >
                        傳送簽署連結
                      </button>
                    )}
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(c)}>
                      刪除
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 電腦：表格 */}
      <div className="card hidden overflow-x-auto xl:block">
        <table className="data-table nowrap">
          <thead>
            <tr>
              <th>合約編號</th>
              <th>報價單</th>
              <th>客戶名稱</th>
              <th>合約金額</th>
              <th>狀態</th>
              <th>NDA</th>
              <th>客戶簽署</th>
              <th>負責人簽署</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.status === "loading" ? (
              <EmptyRow colSpan={9}>載入中…</EmptyRow>
            ) : rows.status === "error" ? (
              <EmptyRow colSpan={9}>無法載入（{rows.message}）</EmptyRow>
            ) : rows.contracts.length === 0 ? (
              <EmptyRow colSpan={9}>尚無合約</EmptyRow>
            ) : (
              // 整列可點擊進入詳情頁；傳送簽署連結、刪除按鈕用 stopPropagation 避免同時觸發
              rows.contracts.map((c) => {
                const status = displayContractStatus(c);
                return (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/desktop/contracts/${c.id}`)}>
                  <td>{c.contractNumber || `#${c.id}`}</td>
                  <td>{c.quoteNumber}</td>
                  <td>{c.clientName}</td>
                  <td className="font-bold">{formatCurrency(c.amount)}</td>
                  <td>
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                  </td>
                  <td>
                    {c.nda ? <span className="badge badge-gold">含 NDA</span> : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td>
                    <SignedBadge signedAt={c.customerSignedAt} />
                  </td>
                  <td>
                    <SignedBadge signedAt={c.staffSignedAt} />
                  </td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {c.status !== "作廢" && !c.customerSignedAt && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          await promptSignLink("contracts", c.id);
                          // 產生連結後狀態會從草稿變成待客戶簽署，重新整理列表
                          apiFetch<ContractSummary[]>("/api/contracts").then(
                            (contracts) => setRows({ status: "ok", contracts }),
                            () => {},
                          );
                        }}
                      >
                        傳送簽署連結
                      </button>
                    )}{" "}
                    {!isContentLocked(c) && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(c)}>
                        刪除
                      </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
