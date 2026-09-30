"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RichEditor } from "@/components/RichEditor";
import { EmptyRow, Message, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson, todayISO, toInputDate } from "@/lib/client";
import type { ContractDetail, ContractItem, QuoteDetail, QuoteSummary } from "@/lib/types";
import { isContentLocked } from "@/lib/contractStatus";
import { NDA_TEMPLATES } from "@/lib/contractTemplates";

interface FormState {
  clientName: string;
  taxId: string;
  contact: string;
  contactPhone: string;
  address: string;
  email: string;
  projectName: string;
  quoteDate: string;
  validUntil: string;
  amount: string;
}

const EMPTY: FormState = {
  clientName: "",
  taxId: "",
  contact: "",
  contactPhone: "",
  address: "",
  email: "",
  projectName: "",
  quoteDate: "",
  validUntil: "",
  amount: "",
};

const CUSTOMER_FIELDS: { key: keyof FormState; label: string; span2?: boolean }[] = [
  { key: "clientName", label: "客戶名稱" },
  { key: "taxId", label: "統一編號" },
  { key: "contact", label: "聯絡人" },
  { key: "contactPhone", label: "聯絡人電話" },
  { key: "address", label: "聯絡地址", span2: true },
  { key: "email", label: "Email", span2: true },
];

const quoteOptionLabel = (q: QuoteSummary) => `${q.quoteNumber || `#${q.id}`} - ${q.clientName || ""} - ${q.totalAmount || ""}`;

export function ContractForm({ editId }: { editId: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => (editId ? EMPTY : { ...EMPTY, quoteDate: todayISO() }));
  const [items, setItems] = useState<ContractItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[] | "error" | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const latestQuoteId = useRef("");
  const [nda, setNda] = useState("");
  const [note, setNote] = useState("");
  // 讀到既有合約後遞增，讓兩個富文字編輯器用新內容重新掛載
  const [editorKey, setEditorKey] = useState(0);
  const [title, setTitle] = useState(editId ? "編輯合約" : "新增合約");
  // 客戶已簽署（內容鎖定）或已作廢的合約不能再編輯，直接擋在表單外
  const [blocked, setBlocked] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  useEffect(() => {
    (async () => {
      try {
        setQuotes(await apiFetch<QuoteSummary[]>("/api/quotes"));
      } catch {
        setQuotes("error");
      }
      if (!editId) return;
      try {
        const d = await apiFetch<ContractDetail>(`/api/contracts/${editId}`);
        setTitle(`編輯合約 ${d.contractNumber || `#${editId}`}`);
        if (isContentLocked(d) || d.status === "作廢") {
          setBlocked(
            d.status === "作廢"
              ? "這份合約已作廢，不能再編輯。可以到合約頁「複製為新版本」。"
              : "客戶已簽署，合約內容已鎖定。如需修改，請到合約頁「作廢並建立新版本」。",
          );
          return;
        }
        setForm({
          clientName: d.clientName || "",
          taxId: d.taxId || "",
          contact: d.contact || "",
          contactPhone: d.contactPhone || "",
          address: d.address || "",
          email: d.email || "",
          projectName: d.projectName || "",
          quoteDate: toInputDate(d.quoteDate),
          validUntil: toInputDate(d.validUntil),
          amount: d.amount || "",
        });
        setNda(d.nda || "");
        setNote(d.note || "");
        setEditorKey((k) => k + 1);
        setItems((d.items || []).map(({ name, price, unit, qty }) => ({ name, price, unit, qty })));
      } catch (err) {
        setMessage({ text: `載入既有合約失敗：${errorText(err)}`, kind: "error" });
      }
    })();
  }, [editId]);

  const quoteList = Array.isArray(quotes) ? quotes : [];

  // 選定報價單後，Ragic 端的「同時載入其他欄位」不會因為 API POST 而觸發，
  // 所以這裡把客戶資訊、合約金額、關聯專案、品項自己抓出來預填，使用者仍可以覆蓋。
  function selectQuote(id: string) {
    setQuoteId(id);
    latestQuoteId.current = id;
    setItems([]);
    if (id) {
      apiFetch<QuoteDetail>(`/api/quotes/${id}`).then(
        (d) =>
          latestQuoteId.current === id &&
          setItems((d.items || []).map(({ name, price, unit, qty }) => ({ name, price, unit, qty: qty || "1" }))),
        (err) => setMessage({ text: `載入報價單品項失敗：${errorText(err)}`, kind: "error" }),
      );
    }
    const q = quoteList.find((x) => String(x.id) === id);
    setForm((f) => ({
      ...f,
      clientName: q?.clientName || "",
      taxId: q?.taxId || "",
      contact: q?.contact || "",
      contactPhone: q?.contactPhone || "",
      address: q?.address || "",
      email: q?.email || "",
      projectName: q?.projectName || "",
      quoteDate: q ? toInputDate(q.quoteDate) : "",
      amount: q?.totalAmount || "",
    }));
  }

  const [ndaTemplate, setNdaTemplate] = useState(NDA_TEMPLATES[0].key);

  // 套用範本會取代目前的 NDA 內容，已經有內容時先確認
  function applyNdaTemplate() {
    const template = NDA_TEMPLATES.find((t) => t.key === ndaTemplate);
    if (!template) return;
    const hasContent = nda.replace(/<[^>]*>/g, "").trim() !== "";
    if (hasContent && !confirm("套用範本會取代目前的保密條款內容，確定嗎？")) return;
    setNda(template.html);
    setEditorKey((k) => k + 1);
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function updateItem(index: number, field: keyof ContractItem, value: string) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = form.amount.trim();
    if (!amount) return setMessage({ text: "請填寫合約金額", kind: "error" });
    const missing = items.findIndex((i) => !i.name?.trim());
    if (missing >= 0) return setMessage({ text: `第 ${missing + 1} 項品項請填寫項目名稱`, kind: "error" });

    const optional = (v: string) => (v.trim() === "" ? undefined : v.trim());
    const payload: Record<string, unknown> = {
      quoteDate: form.quoteDate || undefined,
      validUntil: optional(form.validUntil),
      amount,
      nda,
      note,
      clientName: optional(form.clientName),
      taxId: optional(form.taxId),
      contact: optional(form.contact),
      contactPhone: optional(form.contactPhone),
      address: optional(form.address),
      email: optional(form.email),
      projectName: optional(form.projectName),
      items: items.map(({ name, price, unit, qty }) => ({ name, price, unit, qty: qty || "1" })),
    };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

    if (!editId) {
      const quote = quoteList.find((q) => String(q.id) === quoteId);
      if (!quoteId || !quote) return setMessage({ text: "請選擇報價單", kind: "error" });
      payload.quoteId = quoteId;
      payload.quoteNumber = quote.quoteNumber || "";
      if (payload.clientName === undefined) payload.clientName = quote.clientName || "";
    }

    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      let targetId = editId;
      if (editId) await sendJson(`/api/contracts/${editId}`, "PATCH", payload);
      else targetId = String((await sendJson<{ id: number }>("/api/contracts", "POST", payload)).id);
      setMessage({ text: "已儲存，正在前往詳情頁…", kind: "success" });
      router.push(`/desktop/contracts/${targetId}`);
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle="選定報價單後會自動帶入客戶資料、品項與總金額（含稅），可手動調整；狀態會依雙方簽署情況自動更新"
        actions={
          <Link className="btn btn-outline" href="/desktop/contracts">
            ‹ 返回列表
          </Link>
        }
      />

      {blocked ? (
        <div className="card text-center">
          <p className="mb-4 text-sm">🔒 {blocked}</p>
          <Link className="btn btn-primary" href={`/desktop/contracts/${editId}`}>
            前往合約頁
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          {/* 合約建立後對應的報價單不能再換，編輯模式不顯示報價單選單 */}
          {!editId && (
            <div className="card">
              <h3>對應報價單</h3>
              <div className="form-field">
                <label>
                  選擇報價單<span className="ml-0.5 text-danger">*</span>
                </label>
                <select className="input" value={quoteId} onChange={(e) => selectQuote(e.target.value)}>
                  {quotes === null ? (
                    <option value="">載入中…</option>
                  ) : quotes === "error" ? (
                    <option value="">載入失敗</option>
                  ) : (
                    <>
                      <option value="">請選擇報價單</option>
                      {quotes.map((q) => (
                        <option key={q.id} value={String(q.id)}>
                          {quoteOptionLabel(q)}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <p className="form-hint">格式：報價單編號 - 客戶名稱 - 總金額(含稅)</p>
              </div>
            </div>
          )}

          <div className="card">
            <h3>客戶資料</h3>
            <p className="form-hint mb-3.5">選定報價單後會立即帶入以下欄位，也可以在這裡覆蓋：</p>
            <div className="form-grid">
              {CUSTOMER_FIELDS.map((f) => (
                <div key={f.key} className={`form-field ${f.span2 ? "sm:col-span-2" : ""}`}>
                  <label>{f.label}</label>
                  <input className="input" value={form[f.key]} onChange={set(f.key)} placeholder="自動帶入" />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>合約資訊</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>關聯專案</label>
                <input className="input" value={form.projectName} onChange={set("projectName")} placeholder="自動帶入" />
              </div>
              <div className="form-field">
                <label>報價日期</label>
                <input className="input" type="date" value={form.quoteDate} onChange={set("quoteDate")} />
              </div>
              <div className="form-field">
                <label>有效期限</label>
                <input className="input" type="date" value={form.validUntil} onChange={set("validUntil")} />
              </div>
              <div className="form-field">
                <label>
                  合約金額<span className="ml-0.5 text-danger">*</span>
                </label>
                <input className="input" value={form.amount} onChange={set("amount")} placeholder="自動帶入報價單總金額，可手動調整" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="mb-0">品項</h3>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setItems((list) => [...list, { name: "", price: "", unit: "", qty: "1" }])}
              >
                + 新增品項
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>項目名稱</th>
                    <th className="w-[110px]">單價</th>
                    <th className="w-[90px]">單位</th>
                    <th className="w-[90px]">數量</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <EmptyRow colSpan={5}>尚未加入品項</EmptyRow>
                  ) : (
                    items.map((item, index) => (
                      <tr key={index}>
                        {(["name", "price", "unit", "qty"] as const).map((field) => (
                          <td key={field}>
                            <input className="input-sm" value={item[field] ?? ""} onChange={(e) => updateItem(index, field, e.target.value)} />
                          </td>
                        ))}
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger px-2.5 py-[5px] text-xs"
                            onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                          >
                            移除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="mb-0">保密條款內容（NDA）</h3>
              <div className="flex gap-2">
                <select className="input py-1.5" value={ndaTemplate} onChange={(e) => setNdaTemplate(e.target.value)}>
                  {NDA_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-outline" onClick={applyNdaTemplate}>
                  套用範本
                </button>
              </div>
            </div>
            <RichEditor key={`nda-${editorKey}`} initialHtml={nda} onChange={setNda} />
          </div>

          <div className="card">
            <h3>備註</h3>
            <RichEditor key={`note-${editorKey}`} initialHtml={note} onChange={setNote} />
          </div>

          <div>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              儲存合約
            </button>
            <Message state={message} />
          </div>
        </form>
      )}
    </>
  );
}
