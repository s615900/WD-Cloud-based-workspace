"use client";

import { useEffect, useState } from "react";
import { EmptyRow, LockNotice, Message, Modal, ModalActions, PageHeader, SearchBox, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import type { ClientItem } from "@/lib/types";

type Rows = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; clients: ClientItem[] };

export function ClientsView() {
  const locks = useBusinessLocks();
  const [rows, setRows] = useState<Rows>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClientItem | "new" | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!locks || locks.clients) return;
    apiFetch<ClientItem[]>("/api/clients").then(
      (clients) => setRows({ status: "ok", clients }),
      (err) => setRows({ status: "error", message: errorText(err) }),
    );
  }, [locks, reloadCount]);

  const locked = !!locks?.clients;
  const q = query.trim().toLowerCase();
  const filtered =
    rows.status === "ok"
      ? rows.clients.filter(
          (c) => !q || [c.name, c.contact, c.taxId, c.contactPhone, c.companyPhone].some((v) => (v || "").toLowerCase().includes(q)),
        )
      : [];

  return (
    <>
      <PageHeader
        title="客戶資料"
        subtitle="對應 Ragic quotation-system/1"
        actions={
          locks && !locked ? (
            <button className="btn btn-gold" onClick={() => setEditing("new")}>
              + 新增客戶
            </button>
          ) : null
        }
      />

      {locked ? (
        <LockNotice />
      ) : (
        <div className="card">
          <SearchBox value={query} onChange={setQuery} placeholder="搜尋客戶名稱、聯絡人、統編或電話" />
          {/* 手機／平板：卡片清單 */}
          <div className="flex flex-col gap-2.5 xl:hidden">
            {rows.status === "loading" ? (
              <p className="empty-hint">載入中…</p>
            ) : rows.status === "error" ? (
              <p className="empty-hint">無法載入（{rows.message}）</p>
            ) : rows.clients.length === 0 ? (
              <p className="empty-hint">尚無客戶資料</p>
            ) : filtered.length === 0 ? (
              <p className="empty-hint">找不到符合的客戶</p>
            ) : (
              filtered.map((c) => (
                <button key={c.id} type="button" className="list-card" onClick={() => setEditing(c)}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="id-chip">{c.code || "—"}</span>
                    <span className={c.accountType === "公司戶" ? "badge" : "badge badge-muted"}>{c.accountType || "一般戶"}</span>
                    <span className="badge">{c.type}</span>
                    <span className="ml-auto text-xs text-navy-2">編輯 ›</span>
                  </div>
                  <div className="mb-1 font-bold">{c.name}</div>
                  <div className="list-card-row">
                    <span>聯絡人</span>
                    <span>{c.contact || "—"}</span>
                  </div>
                  <div className="list-card-row">
                    <span>電話</span>
                    <span>{c.contactPhone || c.companyPhone || "—"}</span>
                  </div>
                  {c.taxId && (
                    <div className="list-card-row">
                      <span>統一編號</span>
                      <span className="font-mono">{c.taxId}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="list-card-row">
                      <span>Email</span>
                      <span>{c.email}</span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* 電腦：表格 */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="data-table nowrap">
              <thead>
                <tr>
                  <th>客戶編號</th>
                  <th>戶別</th>
                  <th>類型</th>
                  <th>客戶名稱</th>
                  <th>統一編號</th>
                  <th>聯絡人</th>
                  <th>電話</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.status === "loading" ? (
                  <EmptyRow colSpan={9}>載入中…</EmptyRow>
                ) : rows.status === "error" ? (
                  <EmptyRow colSpan={9}>無法載入（{rows.message}）</EmptyRow>
                ) : rows.clients.length === 0 ? (
                  <EmptyRow colSpan={9}>尚無客戶資料</EmptyRow>
                ) : filtered.length === 0 ? (
                  <EmptyRow colSpan={9}>找不到符合的客戶</EmptyRow>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="group">
                      <td>
                        <span className="id-chip">{c.code || "—"}</span>
                      </td>
                      <td>
                        <span className={c.accountType === "公司戶" ? "badge" : "badge badge-muted border border-line"}>
                          {c.accountType || "一般戶"}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{c.type}</span>
                      </td>
                      <td className="font-bold">{c.name}</td>
                      <td>{c.taxId ? <span className="font-mono">{c.taxId}</span> : <span className="text-muted">—</span>}</td>
                      <td>{c.contact || "—"}</td>
                      <td>{c.contactPhone || c.companyPhone || "—"}</td>
                      <td>{c.email || "—"}</td>
                      <td>
                        <button
                          title="編輯"
                          onClick={() => setEditing(c)}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-white text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-page hover:text-navy max-[900px]:opacity-100"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <ClientModal
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadCount((n) => n + 1);
          }}
        />
      )}
    </>
  );
}

type ClientForm = Omit<ClientItem, "id" | "code">;

const EMPTY_FORM: ClientForm = {
  type: "B2B",
  accountType: "一般戶",
  taxId: "",
  name: "",
  owner: "",
  contact: "",
  contactPhone: "",
  companyPhone: "",
  address: "",
  email: "",
  ext: "",
  im: "",
  bankAccount: "",
  contactMethod: "",
  paymentTerms: "",
  note: "",
};

function ClientModal({ client, onClose, onSaved }: { client: ClientItem | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ClientForm>(() =>
    client ? { ...EMPTY_FORM, ...client, accountType: client.accountType || "一般戶" } : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  const set = (key: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.accountType === "公司戶" && !/^\d{8}$/.test(form.taxId.trim())) {
      setMessage({ text: "公司戶請輸入正確的 8 碼統一編號", kind: "error" });
      return;
    }
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
    ) as ClientForm;

    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      if (client) await sendJson(`/api/clients/${client.id}`, "PATCH", payload);
      else await sendJson("/api/clients", "POST", payload);
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  async function remove() {
    if (!client) return;
    if (!confirm(`確定刪除客戶「${client.name}」？此動作無法復原。\n（已建立的報價單、合約不會一起刪除）`)) return;
    setSaving(true);
    setMessage({ text: "刪除中…" });
    try {
      await apiFetch(`/api/clients/${client.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "刪除失敗"), kind: "error" });
      setSaving(false);
    }
  }

  const text = (key: keyof ClientForm, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>, span2 = false) => (
    <div className={`form-field ${span2 ? "sm:col-span-2" : ""}`}>
      <label>{label}</label>
      <input className="input" value={form[key]} onChange={set(key)} {...extra} />
    </div>
  );

  return (
    <Modal open onClose={onClose} title={client ? "編輯客戶" : "新增客戶"}>
      <form onSubmit={submit}>
        <div className="section-label">基本資料</div>
        <div className="form-grid">
          <div className="form-field">
            <label>
              客戶類型<span className="ml-0.5 text-danger">*</span>
            </label>
            <select className="input" value={form.type} onChange={set("type")}>
              {["B2B", "B2C", "學校", "協會", "品牌"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>戶別</label>
            <select className="input" value={form.accountType} onChange={set("accountType")}>
              <option value="一般戶">一般戶</option>
              <option value="公司戶">公司戶</option>
            </select>
          </div>
          <div className="form-field sm:col-span-2">
            <label>
              客戶名稱<span className="ml-0.5 text-danger">*</span>
            </label>
            <input className="input" value={form.name} onChange={set("name")} />
          </div>
          <div className="form-field">
            <label>
              統一編號{form.accountType === "公司戶" && <span className="ml-0.5 text-danger">*</span>}
            </label>
            <input className="input" value={form.taxId} onChange={set("taxId")} placeholder="8 碼數字，公司戶必填" maxLength={8} />
          </div>
          {text("owner", "負責人")}
        </div>

        <div className="section-label">聯絡資訊</div>
        <div className="form-grid">
          {text("contact", "聯絡人")}
          {text("contactPhone", "聯絡人電話")}
          {text("companyPhone", "公司電話")}
          {text("ext", "分機")}
          {text("email", "Email", { type: "email" })}
          {text("im", "即時通訊軟體")}
          <div className="form-field">
            <label>聯絡方式</label>
            <select className="input" value={form.contactMethod} onChange={set("contactMethod")}>
              <option value="">（未選擇）</option>
              <option value="LINE">LINE</option>
              <option value="E-mail">E-mail</option>
            </select>
          </div>
          {text("address", "聯絡地址", undefined, true)}
        </div>

        <div className="section-label">付款資訊</div>
        <div className="form-grid">
          <div className="form-field">
            <label>付款條件</label>
            <select className="input" value={form.paymentTerms} onChange={set("paymentTerms")}>
              <option value="">（未選擇）</option>
              <option value="現金">現金</option>
              <option value="轉帳">轉帳</option>
            </select>
          </div>
          {text("bankAccount", "銀行帳號")}
        </div>

        <div className="section-label">備註</div>
        <textarea className="input w-full" value={form.note} onChange={set("note")} />

        <Message state={message} />
        <ModalActions>
          {client && (
            <button type="button" className="btn btn-danger mr-auto" onClick={remove} disabled={saving}>
              刪除客戶
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            儲存
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
