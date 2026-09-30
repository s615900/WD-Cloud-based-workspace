"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyRow, LockNotice, PageHeader } from "@/components/ui";
import { apiFetch, errorText, formatCurrency, promptSignLink } from "@/lib/client";
import { displayContractStatus } from "@/lib/contractStatus";
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
      <div className="card overflow-x-auto">
        <table className="data-table">
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
              // 整列可點擊進入詳情頁；傳送簽署連結按鈕用 stopPropagation 避免同時觸發
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
