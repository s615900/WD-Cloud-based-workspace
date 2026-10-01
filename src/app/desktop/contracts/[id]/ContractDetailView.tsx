"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { DetailGrid, DetailRow, Message, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, formatCurrency, promptSignLink, sendJson } from "@/lib/client";
import { displayContractStatus, isContentLocked, isTerminal, restoredStatus } from "@/lib/contractStatus";
import type { ContractDetail } from "@/lib/types";

const orBlank = (v: string | undefined) => v || "（未填）";

export function ContractDetailView({ id }: { id: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ok"; detail: ContractDetail }
  >({ status: "loading" });

  const load = useCallback(() => {
    apiFetch<ContractDetail>(`/api/contracts/${id}`).then(
      (detail) => setState({ status: "ok", detail }),
      (err) => setState({ status: "error", message: errorText(err) }),
    );
  }, [id]);

  useEffect(load, [load]);

  const detail = state.status === "ok" ? state.detail : null;

  return (
    <>
      <PageHeader
        title={detail ? `合約 ${detail.contractNumber || `#${detail.id}`}　${detail.clientName || ""}` : "合約詳情"}
        subtitle={detail ? `報價單 ${detail.quoteNumber || "—"}` : undefined}
        actions={
          <>
            <Link className="btn btn-outline" href="/desktop/contracts">
              ‹ 返回列表
            </Link>
            {/* 客戶簽名後內容鎖定，不提供編輯；作廢的合約也不再編輯 */}
            {detail && !isContentLocked(detail) && detail.status !== "作廢" && (
              <Link className="btn btn-gold" href={`/desktop/contracts/${id}/edit`}>
                編輯這筆合約
              </Link>
            )}
          </>
        }
      />
      {state.status === "loading" && <p className="empty-hint">載入中…</p>}
      {state.status === "error" && <p className="empty-hint">無法載入（{state.message}）</p>}
      {detail && (
        <ContractDetailBody key={`${detail.staffSignedAt}|${detail.status}`} id={id} detail={detail} onReload={load} />
      )}
    </>
  );
}

function ContractDetailBody({ id, detail, onReload }: { id: string; detail: ContractDetail; onReload: () => void }) {
  const router = useRouter();
  const locked = isContentLocked(detail);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });
  const voided = detail.status === "作廢";
  const status = displayContractStatus(detail);

  // 複製這份合約的內容建立新的草稿版本（原合約若還沒作廢會一併作廢）
  async function revise() {
    const text =
      detail.status === "作廢"
        ? "要用這份合約的內容建立一份新的草稿嗎？"
        : "確定要作廢這份合約並建立新版本？\n新版本會複製目前內容、清除所有簽名，需要重新請客戶簽署。";
    if (!confirm(text)) return;
    setSaving(true);
    setMessage({ text: "建立新版本中…" });
    try {
      const result = await sendJson<{ id: number; warning?: string }>(`/api/contracts/${id}/revise`, "POST", {});
      if (result.warning) alert(result.warning);
      router.push(`/desktop/contracts/${result.id}/edit`);
    } catch (err) {
      setMessage({ text: errorText(err, "建立新版本失敗"), kind: "error" });
      setSaving(false);
    }
  }

  // 只有「結案／作廢／恢復」是人工操作，其餘狀態都依簽署情況自動決定
  async function setStatus(next: string, confirmText: string) {
    if (!confirm(confirmText)) return;
    setSaving(true);
    setMessage({ text: "更新中…" });
    try {
      await sendJson(`/api/contracts/${id}`, "PATCH", { status: next });
      onReload();
    } catch (err) {
      setMessage({ text: errorText(err, "更新失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="mb-0">合約狀態</h3>
            <span className={`badge ${status.badge}`}>{status.label}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {isTerminal(detail.status) ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={saving}
                onClick={() => setStatus(restoredStatus(detail), `確定要把合約從「${detail.status}」恢復？`)}
              >
                恢復
              </button>
            ) : (
              <>
                {status.label === "已簽約" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => setStatus("已結案", "確定這份合約已經履約完成、要結案？")}
                  >
                    結案
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => setStatus("作廢", "確定要作廢這份合約？作廢後客戶簽署連結會失效。")}
                >
                  作廢
                </button>
              </>
            )}
          </div>
        </div>
        <p className="form-hint mt-2">狀態會依雙方簽署情況自動更新：草稿 → 待客戶簽署 → 待負責人簽署 → 已簽約。</p>
        {(locked || detail.status === "作廢") && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-gold-soft px-3.5 py-2.5">
            <span className="text-[13px] text-gold-dark">
              {detail.status === "作廢"
                ? "這份合約已作廢，可以複製內容建立新版本。"
                : "🔒 客戶已簽署，合約內容已鎖定。如需修改，請作廢並建立新版本。"}
            </span>
            <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={revise}>
              {detail.status === "作廢" ? "複製為新版本" : "作廢並建立新版本"}
            </button>
          </div>
        )}
        <Message state={message} />
      </div>

      <div className="card">
        <h3>客戶資訊</h3>
        <DetailGrid>
          <DetailRow label="客戶名稱">{orBlank(detail.clientName)}</DetailRow>
          <DetailRow label="統一編號">{orBlank(detail.taxId)}</DetailRow>
          <DetailRow label="聯絡地址">{orBlank(detail.address)}</DetailRow>
          <DetailRow label="聯絡人">{orBlank(detail.contact)}</DetailRow>
          <DetailRow label="聯絡人電話">{orBlank(detail.contactPhone)}</DetailRow>
          <DetailRow label="Email">{orBlank(detail.email)}</DetailRow>
        </DetailGrid>
      </div>

      <div className="card">
        <h3>合約資訊</h3>
        <DetailGrid>
          <DetailRow label="關聯專案">{orBlank(detail.projectName)}</DetailRow>
          <DetailRow label="報價日期">{orBlank(detail.quoteDate)}</DetailRow>
          <DetailRow label="有效期限">{orBlank(detail.validUntil)}</DetailRow>
          <DetailRow label="合約金額">
            <b>{formatCurrency(detail.amount)}</b>
          </DetailRow>
        </DetailGrid>
      </div>

      <div className="card">
        <h3>品項</h3>
        {detail.items?.length ? (
          <>
          {/* 手機：品項清單 */}
          <div className="divide-y divide-line md:hidden">
            {detail.items.map((item, i) => (
              <div key={item.id ?? i} className="py-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{item.name}</span>
                  <span className="font-semibold whitespace-nowrap">
                    {formatCurrency((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0))}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {item.price} × {item.qty} {item.unit}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>項目名稱</th>
                  <th>單價</th>
                  <th>單位</th>
                  <th>數量</th>
                  <th>小計</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td>{item.name}</td>
                    <td>{item.price}</td>
                    <td>{item.unit}</td>
                    <td>{item.qty}</td>
                    <td>{formatCurrency((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="empty-hint">尚無品項</p>
        )}
      </div>

      {/* NDA／備註是自己在合約表單用富文字編輯器寫的 HTML，原樣顯示 */}
      {detail.nda && (
        <div className="card">
          <h3>保密條款內容（NDA）</h3>
          <div className="rich-content" dangerouslySetInnerHTML={{ __html: detail.nda }} />
        </div>
      )}
      {detail.note && (
        <div className="card">
          <h3>備註</h3>
          <div className="rich-content" dangerouslySetInnerHTML={{ __html: detail.note }} />
        </div>
      )}

      <div className="card">
        <h3>客戶簽署</h3>
        {detail.customerSignedAt ? (
          <DetailGrid>
            <DetailRow label="簽署人">{orBlank(detail.customerSignerName)}</DetailRow>
            <DetailRow label="簽署時間">{detail.customerSignedAt}</DetailRow>
          </DetailGrid>
        ) : (
          <>
            <p className="form-hint">尚未完成客戶簽署</p>
            {!voided && (
              <button
                type="button"
                className="btn btn-outline mt-2.5"
                onClick={async () => {
                  await promptSignLink("contracts", id);
                  onReload();
                }}
              >
                產生簽署連結
              </button>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>負責人簽署</h3>
        {detail.staffSignedAt ? (
          <DetailGrid>
            <DetailRow label="簽署人">{orBlank(detail.staffSignerEmail)}</DetailRow>
            <DetailRow label="簽署時間">{detail.staffSignedAt}</DetailRow>
          </DetailGrid>
        ) : voided ? (
          <p className="form-hint">合約已作廢，無法簽署</p>
        ) : (
          <StaffSignature id={id} onSigned={onReload} />
        )}
      </div>

    </div>
  );
}

// 負責人簽署直接在桌面版內畫簽名送出。簽署人 email 由後端環境變數 CONTRACT_STAFF_EMAIL 決定，
// 這裡先載入顯示是哪個帳號，避免使用者不清楚簽下去會記錄成誰。
function StaffSignature({ id, onSigned }: { id: string; onSigned: () => void }) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hint, setHint] = useState("載入負責人資料中…");
  const [blocked, setBlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  useEffect(() => {
    apiFetch<{ email: string }>("/api/contracts/staff-signer").then(
      (r) => setHint(`簽署人將記錄為：${r.email}`),
      (err) => {
        setHint(`尚未設定負責人 email（${errorText(err)}），無法送出簽署`);
        setBlocked(true);
      },
    );
  }, []);

  async function submit() {
    if (!pad.current || pad.current.isEmpty()) return setMessage({ text: "請先簽名", kind: "error" });
    setSending(true);
    setMessage({ text: "送出中…" });
    try {
      await sendJson(`/api/contracts/${id}/staff-signature`, "POST", { signatureImage: pad.current.toDataUrl() });
      setMessage({ text: "已完成簽署", kind: "success" });
      onSigned();
    } catch (err) {
      setMessage({ text: errorText(err, "送出失敗"), kind: "error" });
      setSending(false);
    }
  }

  return (
    <div>
      <p className="form-hint mb-2">{hint}</p>
      <SignaturePad ref={pad} />
      <div className="mt-2 flex justify-end">
        <button type="button" className="btn btn-outline" onClick={() => pad.current?.clear()}>
          清除重簽
        </button>
      </div>
      <button type="button" className="btn btn-gold mt-3" disabled={blocked || sending} onClick={submit}>
        確認簽署
      </button>
      <Message state={message} />
    </div>
  );
}
