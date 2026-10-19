"use client";

// 財務頁共用的小元件與格式函式（樣式見 finance.module.css，不使用全站 navy／gold 元件）
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, errorText } from "@/lib/client";
import s from "./finance.module.css";

export function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
}

export function FinModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={s.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.modal} role="dialog" aria-label={title}>
        <h2 className={s.modalTitle}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label}>{label}</label>
      {children}
      {hint ? <div className={s.hint}>{hint}</div> : null}
    </div>
  );
}

export function Msg({ text, kind }: { text: string; kind?: "error" | "ok" }) {
  return <p className={`${s.msg} ${kind === "error" ? s.msgError : kind === "ok" ? s.msgOk : ""}`}>{text}</p>;
}

// ── 資料抓取 hook ─────────────────────────────────────────────


export function useApi<T>(url: string, version: number): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    apiFetch<T>(url).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setError("");
      },
      (err) => alive && setError(errorText(err, "讀取失敗")),
    );
    return () => {
      alive = false;
    };
  }, [url, version, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

// ── 設定檔驅動的表單 ──────────────────────────────────────────
// 各分頁的新增／編輯表單欄位很像：用欄位清單描述，統一處理狀態、送出與錯誤顯示。

export type FieldValue = string | boolean;
export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "month" | "select" | "check" | "textarea";
  options?: { value: string; label: string }[];
  hint?: string;
  half?: boolean;
  disabled?: boolean;
  show?: (v: Record<string, FieldValue>) => boolean;
};

export function EntityForm({
  title,
  fields,
  initial,
  submitLabel = "儲存",
  onSubmit,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  initial: Record<string, FieldValue>;
  submitLabel?: string;
  onSubmit: (values: Record<string, FieldValue>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: string, v: FieldValue) => setValues((prev) => ({ ...prev, [key]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await onSubmit(values);
    } catch (err) {
      setMsg(errorText(err, "儲存失敗"));
      setSaving(false);
    }
  }

  const visible = fields.filter((f) => !f.show || f.show(values));
  const rows: FieldDef[][] = [];
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i]!;
    const next = visible[i + 1];
    if (f.half && next?.half) {
      rows.push([f, next]);
      i++;
    } else rows.push([f]);
  }

  const render = (f: FieldDef) => {
    const v = values[f.key];
    if (f.kind === "check")
      return (
        <label className={s.check}>
          <input type="checkbox" checked={Boolean(v)} disabled={f.disabled} onChange={(e) => set(f.key, e.target.checked)} />
          {f.label}
        </label>
      );
    const common = { "aria-label": f.label, disabled: f.disabled } as const;
    return (
      <Field label={f.label} hint={f.hint}>
        {f.kind === "select" ? (
          <select className={s.select} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} {...common}>
            <option value="">請選擇</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : f.kind === "textarea" ? (
          <textarea className={s.textarea} rows={2} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} {...common} />
        ) : (
          <input
            className={s.input}
            type={f.kind === "month" ? "month" : f.kind}
            value={String(v ?? "")}
            onChange={(e) => set(f.key, e.target.value)}
            {...common}
          />
        )}
      </Field>
    );
  };

  return (
    <FinModal title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {rows.map((row) =>
          row.length === 2 ? (
            <div key={row[0]!.key} className={s.row2}>
              {render(row[0]!)}
              {render(row[1]!)}
            </div>
          ) : (
            <div key={row[0]!.key} className={row[0]!.kind === "check" ? s.field : undefined}>
              {render(row[0]!)}
            </div>
          ),
        )}
        <Msg text={msg} kind="error" />
        <div className={s.modalActions}>
          <button type="button" className={s.btn} onClick={onClose}>
            取消
          </button>
          <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={saving}>
            {saving ? "處理中…" : submitLabel}
          </button>
        </div>
      </form>
    </FinModal>
  );
}

export const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
