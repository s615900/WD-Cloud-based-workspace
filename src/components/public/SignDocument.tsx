"use client";

// 客戶簽署頁（報價單／合約共用）：免登入，連結本身帶簽章過的 token 當存取憑證。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { formatCurrency } from "@/lib/client";

interface SignItem {
  name: string;
  price: string;
  unit: string;
  qty: string;
  note?: string;
}

interface SignDetailBase {
  quoteNumber: string;
  clientName: string;
  quoteDate: string;
  validUntil: string;
  note: string;
  items: SignItem[];
  signed: boolean;
  signerName: string;
  signedAt: string;
}

export interface QuoteSignDetail extends SignDetailBase {
  projectName: string;
  untaxedAmount: string;
  taxAmount: string;
  totalAmount: string;
  contractTerms: string;
}

export interface ContractSignDetail extends SignDetailBase {
  contractNumber: string;
  amount: string;
  nda: string;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 rounded-card border border-line bg-white p-[18px]">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function AmountRow({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${total ? "mt-1.5 border-t-2 border-line pt-2.5 text-lg font-bold" : "text-sm"}`}>
      <span>{label}</span>
      <span>{formatCurrency(parseFloat(value) || 0)}</span>
    </div>
  );
}

function ItemsTable({ items, showNote }: { items: SignItem[]; showNote: boolean }) {
  if (!items?.length) return <p>（無品項）</p>;
  const cell = "border-b border-line px-1.5 py-2 text-left";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-muted">
            {["品項", "單價", "單位", "數量", ...(showNote ? ["備註"] : [])].map((h) => (
              <th key={h} className={`${cell} font-semibold`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className={cell}>{item.name}</td>
              <td className={cell}>{item.price}</td>
              <td className={cell}>{item.unit}</td>
              <td className={cell}>{item.qty}</td>
              {showNote && <td className={cell}>{item.note ?? ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Kind = "quote" | "contract";

export function SignDocument({ kind, token }: { kind: Kind; token: string }) {
  const api = kind === "quote" ? "/api/quote-sign/" : "/api/contract-sign/";
  const docLabel = kind === "quote" ? "報價單" : "合約";
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ok"; detail: QuoteSignDetail | ContractSignDetail }
  >({ status: "loading" });

  // 簽署完成後遞增，重新讀一次顯示已簽署狀態
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    fetch(api + encodeURIComponent(token))
      .then(async (res) => {
        const detail = await res.json();
        if (!res.ok) throw new Error(detail.error || "無法載入");
        setState({ status: "ok", detail });
      })
      .catch((err) =>
        setState({ status: "error", message: err instanceof Error ? err.message : "連結無效或已失效，請跟業務確認" }),
      );
  }, [api, token, reloadCount]);

  let title = `${docLabel}確認`;
  let subtitle = "載入中…";
  let body: ReactNode = <div className="px-5 py-[60px] text-center text-muted">載入中…</div>;

  if (!token) {
    subtitle = "連結無效";
    body = <div className="px-5 py-[60px] text-center text-muted">這個連結缺少必要參數，請跟業務確認正確的連結。</div>;
  } else if (state.status === "error") {
    subtitle = "無法載入";
    body = <div className="px-5 py-[60px] text-center text-muted">{state.message}</div>;
  } else if (state.status === "ok") {
    const d = state.detail;
    if (kind === "quote") {
      const q = d as QuoteSignDetail;
      title = q.projectName || q.quoteNumber || title;
      subtitle = `報價單編號 ${q.quoteNumber || "—"}　${q.clientName || ""}`;
    } else {
      const c = d as ContractSignDetail;
      title = c.contractNumber || title;
      subtitle = `報價單編號 ${c.quoteNumber || "—"}　${c.clientName || ""}`;
    }
    body = <SignBody kind={kind} detail={d} api={api} token={token} onSigned={() => setReloadCount((n) => n + 1)} />;
  }

  return (
    <div className="p-4 pt-[max(16px,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-[640px]">
        <header className="mb-4 rounded-card bg-navy p-5 text-white">
          <h1 className="mb-1 text-xl font-bold">{title}</h1>
          <p className="text-[13px] opacity-85">{subtitle}</p>
        </header>
        {body}
      </div>
    </div>
  );
}

function SignBody({
  kind,
  detail,
  api,
  token,
  onSigned,
}: {
  kind: Kind;
  detail: QuoteSignDetail | ContractSignDetail;
  api: string;
  token: string;
  onSigned: () => void;
}) {
  const q = detail as QuoteSignDetail;
  const c = detail as ContractSignDetail;
  // 報價單要同意「合約條款內容」，合約要同意「保密條款內容（NDA）」
  const termsLabel = kind === "quote" ? "合約條款" : "保密條款";
  const needsAgree = kind === "quote" ? !!q.contractTerms : !!c.nda;

  return (
    <>
      <Card title={kind === "quote" ? "報價資訊" : "合約資訊"}>
        <Row label="客戶名稱" value={detail.clientName} />
        <Row label="報價日期" value={detail.quoteDate} />
        <Row label={kind === "quote" ? "報價有效期限" : "有效期限"} value={detail.validUntil} />
      </Card>

      <Card title="品項明細">
        <ItemsTable items={detail.items} showNote={kind === "quote"} />
      </Card>

      {kind === "quote" ? (
        <Card title="金額">
          <AmountRow label="未稅金額" value={q.untaxedAmount} />
          <AmountRow label="稅額" value={q.taxAmount} />
          <AmountRow label="總金額（含稅）" value={q.totalAmount} total />
        </Card>
      ) : (
        <Card title="合約金額">
          <AmountRow label="總金額（含稅）" value={c.amount} total />
        </Card>
      )}

      {kind === "quote" ? (
        <>
          {q.note && (
            <Card title="特別說明">
              <p className="text-sm whitespace-pre-wrap">{q.note}</p>
            </Card>
          )}
          {q.contractTerms && (
            <Card title="合約條款內容">
              <div className="max-h-[220px] overflow-y-auto rounded-[10px] border border-line bg-subtle p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                {q.contractTerms}
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          {/* NDA／備註是業務自己在合約表單寫的富文字 HTML */}
          {c.nda && (
            <Card title="保密條款內容（NDA）">
              <div
                className="rich-content max-h-[260px] overflow-y-auto rounded-[10px] border border-line bg-subtle p-3 text-[13px]"
                dangerouslySetInnerHTML={{ __html: c.nda }}
              />
            </Card>
          )}
          {c.note && (
            <Card title="備註">
              <div
                className="rich-content max-h-[260px] overflow-y-auto rounded-[10px] border border-line bg-subtle p-3 text-[13px]"
                dangerouslySetInnerHTML={{ __html: c.note }}
              />
            </Card>
          )}
        </>
      )}

      {detail.signed ? (
        <Card title="簽署狀態">
          <span className="inline-block rounded-full bg-[#E4F5EE] px-3 py-1 text-[13px] font-semibold text-[#1F7A54]">
            ✓ 已完成簽署
          </span>
          <div className="mt-3">
            <Row label="簽署人" value={detail.signerName} />
            <Row label="簽署時間" value={detail.signedAt} />
          </div>
        </Card>
      ) : (
        <SignForm api={api} token={token} needsAgree={needsAgree} termsLabel={termsLabel} onSigned={onSigned} />
      )}
    </>
  );
}

function SignForm({
  api,
  token,
  needsAgree,
  termsLabel,
  onSigned,
}: {
  api: string;
  token: string;
  needsAgree: boolean;
  termsLabel: string;
  onSigned: () => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>({ text: "" });

  async function submit() {
    if (!name.trim()) return setMessage({ text: "請填寫簽署人姓名", error: true });
    if (needsAgree && !agreed) return setMessage({ text: `請先閱讀並勾選同意${termsLabel}`, error: true });
    if (!pad.current || pad.current.isEmpty()) return setMessage({ text: "請先簽名", error: true });

    setSending(true);
    setMessage({ text: "送出中…" });
    try {
      const res = await fetch(api + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: name.trim(), signatureImage: pad.current.toDataUrl() }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "送出失敗");
      onSigned();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "送出失敗", error: true });
      setSending(false);
    }
  }

  return (
    <Card title="確認簽署">
      <label className="text-sm">簽署人姓名</label>
      <input
        className="input mt-1 mb-3 w-full"
        placeholder="請輸入姓名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {needsAgree && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>我已閱讀並同意上方{termsLabel}內容</span>
        </label>
      )}
      <label className="mt-3.5 mb-1 block text-sm">簽名</label>
      <SignaturePad ref={pad} className="h-[200px]" />
      <div className="mt-2 flex justify-end">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => pad.current?.clear()}>
          清除重簽
        </button>
      </div>
      <button
        type="button"
        className="btn mt-4 w-full bg-gradient-to-br from-gold to-gold-dark py-3 text-navy"
        disabled={sending}
        onClick={submit}
      >
        確認簽署並送出
      </button>
      <p className={`mt-2.5 min-h-[18px] text-[13px] ${message.error ? "text-danger" : ""}`}>{message.text}</p>
    </Card>
  );
}
