"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalcRow, DetailGrid, DetailRow, Message, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, formatCurrency, promptSignLink, sendJson } from "@/lib/client";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import { PAYMENT_STATUSES, type QuoteDetail } from "@/lib/types";

// 金額一律用「品項＋折扣率＋稅率」在前端即時算出來顯示，不直接信任 Ragic 的三個金額欄位——
// 剛送出、Ragic 還沒算完的當下讀到的會是空字串。計算邏輯跟送出時換算給 Ragic 的完全對齊。
function calcAmounts(detail: QuoteDetail) {
  const subtotal = (detail.items || []).reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0),
    0,
  );
  let discount = parseFloat(detail.discountRate);
  if (!Number.isFinite(discount)) discount = 1;
  // Ragic 存的是小數（"0.05"），舊資料可能是百分比（"5" 或 "5%"）：大於 1 才當百分比換算
  const taxRateMatch = String(detail.taxRate || "").match(/[\d.]+/);
  const rawRate = taxRateMatch ? parseFloat(taxRateMatch[0]) : NaN;
  const taxRate = !Number.isFinite(rawRate) ? 0.05 : rawRate > 1 ? rawRate / 100 : rawRate;

  const afterDiscount = subtotal * discount;
  let untaxed: number;
  let tax: number;
  let total: number;
  if (detail.taxMode === "稅內含") {
    untaxed = afterDiscount / (1 + taxRate);
    total = afterDiscount;
    tax = total - untaxed;
  } else {
    untaxed = afterDiscount;
    tax = untaxed * taxRate;
    total = untaxed + tax;
  }
  return { subtotal, afterDiscount, untaxed, tax, total, taxRate };
}

const orBlank = (v: string | undefined, fallback = "（未填）") => v || fallback;

export function QuoteDetailView({ id }: { id: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; detail: QuoteDetail }>(
    { status: "loading" },
  );

  const load = useCallback(() => {
    apiFetch<QuoteDetail>(`/api/quotes/${id}`).then(
      (detail) => setState({ status: "ok", detail }),
      (err) => setState({ status: "error", message: errorText(err) }),
    );
  }, [id]);

  useEffect(load, [load]);

  const detail = state.status === "ok" ? state.detail : null;

  return (
    <>
      <PageHeader
        title={detail ? `報價單 ${detail.quoteNumber || `#${detail.id}`}　${detail.clientName || ""}` : "報價單詳情"}
        subtitle={detail ? `報價日期 ${detail.quoteDate || "（未填）"}` : undefined}
        actions={
          <>
            <Link className="btn btn-outline" href="/desktop/quotes">
              ‹ 返回列表
            </Link>
            <Link className="btn btn-gold" href={`/desktop/quotes/${id}/edit`}>
              編輯這筆報價單
            </Link>
          </>
        }
      />
      {state.status === "loading" && <p className="empty-hint">載入中…</p>}
      {state.status === "error" && <p className="empty-hint">無法載入（{state.message}）</p>}
      {detail && <QuoteDetailBody id={id} detail={detail} />}
    </>
  );
}

function QuoteDetailBody({ id, detail }: { id: string; detail: QuoteDetail }) {
  const calc = calcAmounts(detail);
  const [linkBusy, setLinkBusy] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(detail.paymentStatus || "未付款");
  const [paidAmount, setPaidAmount] = useState(detail.paidAmount || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function savePayment() {
    setSaving(true);
    setMessage({ text: "更新中…" });
    try {
      await sendJson(`/api/quotes/${id}`, "PATCH", { paymentStatus, paidAmount: paidAmount.trim() });
      setMessage({ text: "已更新付款狀態", kind: "success" });
    } catch (err) {
      setMessage({ text: errorText(err, "更新失敗"), kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card">
        <h3>客戶資訊</h3>
        <DetailGrid>
          <DetailRow label="客戶名稱">{orBlank(detail.clientName)}</DetailRow>
          <DetailRow label="統一編號">{orBlank(detail.taxId)}</DetailRow>
          <DetailRow label="聯絡地址">{orBlank(detail.address)}</DetailRow>
          <DetailRow label="聯絡人">{orBlank(detail.contact)}</DetailRow>
          <DetailRow label="公司電話">{orBlank(detail.companyPhone)}</DetailRow>
          <DetailRow label="聯絡人電話">{orBlank(detail.contactPhone)}</DetailRow>
          <DetailRow label="電子郵件">{orBlank(detail.email)}</DetailRow>
        </DetailGrid>
      </div>

      <div className="card">
        <h3>報價資訊</h3>
        <DetailGrid>
          <DetailRow label="專案名稱">{orBlank(detail.projectName)}</DetailRow>
          <DetailRow label="報價日期">{orBlank(detail.quoteDate)}</DetailRow>
          <DetailRow label="報價有效期限">{orBlank(detail.validUntil)}</DetailRow>
          <DetailRow label="課稅別">{detail.taxType || "營業稅"}</DetailRow>
          <DetailRow label="計稅方式">{detail.taxMode || "稅外加"}</DetailRow>
          <DetailRow label="稅率">{Math.round(calc.taxRate * 10000) / 100}%</DetailRow>
          <DetailRow label="折扣率">{Math.round(parseFloat(detail.discountRate || "1") * 100)}%</DetailRow>
        </DetailGrid>
        {detail.note && (
          <DetailRow label="特別說明" className="mt-3">
            {detail.note}
          </DetailRow>
        )}
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
                  {item.note ? `・${item.note}` : ""}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>品項</th>
                  <th>單價</th>
                  <th>單位</th>
                  <th>數量</th>
                  <th>小計</th>
                  <th>備註</th>
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
                    <td>{item.note}</td>
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

      <div className="card">
        <h3>金額</h3>
        <div className="flex max-w-[420px] flex-col gap-2">
          <CalcRow label="品項小計" value={formatCurrency(calc.subtotal)} />
          <CalcRow label="套用折扣後金額" value={formatCurrency(calc.afterDiscount)} />
          <CalcRow label="未稅金額" value={formatCurrency(calc.untaxed)} />
          <CalcRow label="稅額" value={formatCurrency(calc.tax)} />
          <CalcRow label="總金額（含稅）" value={formatCurrency(calc.total)} total />
        </div>
      </div>

      {detail.contractTerms && (
        <div className="card">
          <h3>合約條款內容</h3>
          <p className="text-sm whitespace-pre-wrap">{detail.contractTerms}</p>
        </div>
      )}

      <div className="card">
        <h3>客戶簽署</h3>
        {detail.signedAt ? (
          <DetailGrid>
            <DetailRow label="簽署人">{orBlank(detail.signerName)}</DetailRow>
            <DetailRow label="簽署時間">{detail.signedAt}</DetailRow>
            <DetailRow label="已讀時間">{orBlank(detail.readAt)}</DetailRow>
          </DetailGrid>
        ) : (
          <>
            <DetailGrid>
              <DetailRow label="已讀時間">{orBlank(detail.readAt, "尚未開啟")}</DetailRow>
            </DetailGrid>
            <p className="form-hint mt-2.5">尚未完成簽署</p>
            <button
              type="button"
              className="btn btn-outline mt-2.5"
              disabled={linkBusy}
              onClick={async () => {
                setLinkBusy(true);
                await promptSignLink("quotes", id);
                setLinkBusy(false);
              }}
            >
              產生簽署連結
            </button>
          </>
        )}
      </div>

      <CreateContractCard quoteId={id} customerSigned={!!detail.signedAt} />

      <div className="card">
        <h3>付款資訊</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>付款狀態</label>
            <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>已收金額</label>
            <input className="input" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-gold mt-3" disabled={saving} onClick={savePayment}>
          更新付款狀態
        </button>
        <Message state={message} />
      </div>
    </div>
  );
}

// 一鍵從這張報價單產生合約：品項、金額、客戶資料由伺服器直接從報價單帶入。
// 同一張報價單已經有合約時，改成直接前往那份合約。
function CreateContractCard({ quoteId, customerSigned }: { quoteId: string; customerSigned: boolean }) {
  const router = useRouter();
  const locks = useBusinessLocks();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  if (!locks || locks.contracts) return null;

  async function create() {
    setBusy(true);
    setMessage({ text: "產生中…" });
    try {
      const res = await fetch("/api/contracts/from-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (res.status === 409 && data.id) {
        if (confirm(`${data.error}，要前往查看嗎？`)) router.push(`/desktop/contracts/${data.id}`);
        setMessage({ text: data.error ?? "", kind: "error" });
        setBusy(false);
        return;
      }
      if (!res.ok || !data.id) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/desktop/contracts/${data.id}`);
    } catch (err) {
      setMessage({ text: errorText(err, "產生合約失敗"), kind: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>合約</h3>
      <p className="form-hint">
        {customerSigned
          ? "客戶已確認這張報價單，可以直接產生合約。"
          : "客戶尚未線上確認這張報價單；建議客戶確認後再產生合約。"}
        品項、金額、客戶資料會自動從報價單帶入。
      </p>
      <button type="button" className="btn btn-gold mt-3" disabled={busy} onClick={create}>
        從這張報價單產生合約
      </button>
      <Message state={message} />
    </div>
  );
}
