"use client";

import { useEffect, useState } from "react";
import { LockNotice, Message, Modal, ModalActions, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import { useBusinessLocks } from "@/lib/useBusinessLocks";
import type { ProjectItem, QuoteSummary } from "@/lib/types";

const STATUSES = ["洽談中", "籌備中", "拍攝中", "後製修圖", "客戶校稿", "已結案"];
const CANCEL_STATUS = "取消";
const PROJECT_TYPES = ["婚禮紀錄", "商業攝影", "人像寫真", "活動紀錄", "空間攝影", "形象照", "其他"];

const quoteOptionLabel = (q: QuoteSummary) => `${q.quoteNumber || `#${q.id}`} - ${q.clientName || ""} - ${q.totalAmount || ""}`;

export function ProjectsView() {
  const locks = useBusinessLocks();
  const [quotes, setQuotes] = useState<QuoteSummary[] | "error" | null>(null);
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!locks || locks.projects) return;
    (async () => {
      try {
        setQuotes(await apiFetch<QuoteSummary[]>("/api/quotes"));
      } catch {
        setQuotes("error");
      }
      try {
        setProjects(await apiFetch<ProjectItem[]>("/api/projects"));
      } catch (err) {
        setLoadError(errorText(err));
      }
    })();
  }, [locks]);

  // 依報價單自己的「專案編號」（P-code）查找，給看板卡片顯示報價單編號用
  const quotesByProjectCode = new Map(
    (Array.isArray(quotes) ? quotes : []).filter((q) => q.projectCode).map((q) => [q.projectCode, q]),
  );

  const quoteNumberOf = (p: ProjectItem) => quotesByProjectCode.get(p.projectCode)?.quoteNumber || "—";

  // 先樂觀更新畫面，API 失敗再還原
  async function updateStatus(id: number, newStatus: string) {
    const project = projects?.find((p) => p.id === id);
    if (!project || project.status === newStatus) return;
    const prev = project.status;
    const setStatusOf = (status: string) => setProjects((list) => list?.map((p) => (p.id === id ? { ...p, status } : p)) ?? null);
    setStatusOf(newStatus);
    try {
      await sendJson(`/api/projects/${id}`, "PATCH", { status: newStatus });
    } catch (err) {
      setStatusOf(prev);
      alert(errorText(err, "更新狀態失敗"));
    }
  }

  async function removeProject(id: number) {
    try {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((list) => list?.filter((p) => p.id !== id) ?? null);
    } catch (err) {
      alert(errorText(err, "刪除失敗"));
    }
  }

  const locked = !!locks?.projects;
  const cancelled = projects?.filter((p) => p.status === CANCEL_STATUS) ?? [];

  return (
    <>
      <PageHeader
        title="攝影專案管理"
        subtitle="對應 Ragic quotation-system/13・拖曳卡片即可切換狀態"
        actions={
          locks && !locked ? (
            <button className="btn btn-gold" onClick={() => setCreating(true)}>
              + 新增專案
            </button>
          ) : null
        }
      />

      {locked ? (
        <LockNotice />
      ) : (
        <>
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="mb-0">專案進度看板</h3>
              <span className="text-xs text-muted">拖曳卡片可切換階段</span>
            </div>
            {loadError ? (
              <p className="empty-hint">無法載入（{loadError}）</p>
            ) : !projects ? (
              <p className="empty-hint">載入中…</p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {STATUSES.map((status) => {
                  const cards = projects.filter((p) => p.status === status);
                  return (
                    <div
                      key={status}
                      className={`min-w-0 rounded-card p-3 ${dragOver === status ? "bg-navy-soft" : "bg-[#F1F5F8]"}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(status);
                      }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        updateStatus(Number(e.dataTransfer.getData("text/plain")), status);
                      }}
                    >
                      <h3 className="mx-1 mt-1 mb-2.5 text-[13px]">
                        {status}（{cards.length}）
                      </h3>
                      {cards.map((p) => (
                        <ProjectCard key={p.id} p={p} quoteNumber={quoteNumberOf(p)} onStatus={updateStatus} onDelete={removeProject} />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {cancelled.length > 0 && (
            <details className="mt-[18px] rounded-card bg-[#F7F7F7] p-3">
              <summary className="cursor-pointer text-[13px] font-bold text-navy">已取消專案（{cancelled.length}）</summary>
              <div className="mt-2.5">
                {cancelled.map((p) => (
                  <ProjectCard key={p.id} p={p} quoteNumber={quoteNumberOf(p)} onStatus={updateStatus} onDelete={removeProject} cancelled />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {creating && (
        <NewProjectModal
          quotes={quotes}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            // 存檔成功後直接把新專案插入畫面，不重打 GET /api/projects
            setProjects((list) => [...(list ?? []), project]);
          }}
        />
      )}
    </>
  );
}

function ProjectCard({
  p,
  quoteNumber,
  cancelled,
  onStatus,
  onDelete,
}: {
  p: ProjectItem;
  quoteNumber: string;
  cancelled?: boolean;
  onStatus: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      draggable={!cancelled}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(p.id))}
      className={`mb-2.5 rounded-[10px] bg-white p-3 text-[13px] shadow-card ${cancelled ? "opacity-70" : "cursor-grab active:cursor-grabbing"}`}
    >
      <div className="mb-1 font-bold">
        {quoteNumber}　{p.clientName || ""}
      </div>
      {p.projectType && (
        <div className="mb-1.5">
          <span className="badge badge-gold">{p.projectType}</span>
        </div>
      )}
      <div className="form-hint">拍攝日期：{p.shootDate || "—"}</div>
      {p.deliveryLink && (
        <div className="form-hint">
          <a href={p.deliveryLink} target="_blank" rel="noopener noreferrer">
            交付連結 ›
          </a>
        </div>
      )}
      {cancelled ? (
        <select
          className="mt-1.5 text-xs"
          value=""
          onChange={(e) => e.target.value && onStatus(p.id, e.target.value)}
        >
          <option value="">恢復為…</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          className="mt-1 cursor-pointer text-xs text-[#9AA5B1] underline"
          onClick={() => {
            if (confirm("確定要將此專案設為取消？")) onStatus(p.id, CANCEL_STATUS);
          }}
        >
          設為取消
        </button>
      )}
      <button
        type="button"
        className="mt-1 ml-3 cursor-pointer text-xs text-danger underline"
        onClick={() => {
          if (confirm(`確定刪除專案「${quoteNumber}　${p.clientName || ""}」？此動作無法復原。`)) onDelete(p.id);
        }}
      >
        刪除
      </button>
    </div>
  );
}

function NewProjectModal({
  quotes,
  onClose,
  onCreated,
}: {
  quotes: QuoteSummary[] | "error" | null;
  onClose: () => void;
  onCreated: (p: ProjectItem) => void;
}) {
  const [quoteId, setQuoteId] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [projectType, setProjectType] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });
  const quote = Array.isArray(quotes) ? quotes.find((q) => String(q.id) === quoteId) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteId || !quote) return setMessage({ text: "請選擇報價單", kind: "error" });
    if (!quote.clientId) return setMessage({ text: "所選報價單缺少客戶編號連結，請先回報價單補上客戶", kind: "error" });
    if (!quote.projectCode) return setMessage({ text: "所選報價單缺少專案編號，請先回報價單確認", kind: "error" });
    if (!shootDate) return setMessage({ text: "請填寫拍攝日期", kind: "error" });

    // Ragic 表單端的「同時載入其他欄位」不會因為 API POST 而觸發，客戶資訊要跟報價單一起送出
    const payload = {
      quoteId,
      projectCode: quote.projectCode,
      clientId: quote.clientId,
      contact: quote.contact || "",
      clientName: quote.clientName || "",
      companyPhone: quote.companyPhone || "",
      email: quote.email || "",
      shootDate,
      projectType: projectType || undefined,
      status: "洽談中",
    };
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      const created = await sendJson<{ id: number }>("/api/projects", "POST", payload);
      onCreated({
        id: created.id,
        projectCode: payload.projectCode,
        clientId: payload.clientId,
        contact: payload.contact,
        clientName: payload.clientName,
        companyPhone: payload.companyPhone,
        email: payload.email,
        shootDate: shootDate.replaceAll("-", "/"),
        projectType,
        status: "洽談中",
        deliveryLink: "",
      });
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="新增專案">
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field sm:col-span-2">
            <label>
              選擇來源報價單<span className="ml-0.5 text-danger">*</span>
            </label>
            <select className="input" value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
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
          {(
            [
              ["客戶名稱", quote?.clientName],
              ["聯絡人", quote?.contact],
              ["公司電話", quote?.companyPhone],
              ["電子郵件", quote?.email],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="form-field">
              <label>{label}</label>
              <input className="input" value={value ?? ""} disabled />
            </div>
          ))}
          <div className="form-field">
            <label>
              拍攝日期<span className="ml-0.5 text-danger">*</span>
            </label>
            <input className="input" type="date" value={shootDate} onChange={(e) => setShootDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>專案類型</label>
            <select className="input" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
              <option value="">請選擇類型</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="form-hint mt-3">
          以上客戶資訊隨選定的報價單自動帶入；專案狀態新增時一律預設「洽談中」，之後在看板拖曳卡片切換。
        </p>
        <Message state={message} />
        <ModalActions>
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
