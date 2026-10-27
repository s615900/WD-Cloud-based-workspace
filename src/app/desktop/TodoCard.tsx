"use client";

// 首頁待辦卡片：列出還沒完成的待辦（釘選的排最前面），可以直接勾完成、快速新增。
// 完整的編輯、釘選、到期日請到待辦事項頁。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import type { TaskListItem } from "@/lib/types";

const LIMIT = 6;

const titleOf = (content: string) => {
  const first = (content.split("\n")[0] ?? "").replace(/^\s*(#{1,3}\s+|>\s?|[-*]\s+)/, "");
  return first || content;
};

export function TodoCard() {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; tasks: TaskListItem[] }>({
    status: "loading",
  });
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    apiFetch<TaskListItem[]>("/api/tasks?type=備忘").then(
      (all) => setState({ status: "ok", tasks: all.filter((t) => t.status !== "完成" && t.status !== "取消") }),
      (err) => setState({ status: "error", message: errorText(err) }),
    );
  }, [tick]);

  async function complete(t: TaskListItem) {
    setError("");
    try {
      await sendJson(`/api/tasks/${t.id}`, "PATCH", { status: "完成", source: "todo" });
      reload();
    } catch (err) {
      setError(errorText(err, "更改狀態失敗"));
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await sendJson("/api/tasks", "POST", { type: "備忘", content: draft.trim() });
      setDraft("");
      reload();
    } catch (err) {
      setError(errorText(err, "新增失敗"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="mb-0">待辦事項</h3>
        <Link href="/desktop/tasks" className="text-[13px] font-semibold text-navy-2 no-underline">
          查看全部 ›
        </Link>
      </div>

      <form onSubmit={add} className="mb-2 flex gap-2">
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="快速新增一筆待辦…" aria-label="快速新增待辦" />
        <button type="submit" className="btn btn-primary flex-none" disabled={busy || !draft.trim()}>
          新增
        </button>
      </form>
      {error ? <p className="mb-2 text-[13px] text-danger">{error}</p> : null}

      {state.status === "loading" ? (
        <p className="empty-hint">載入中…</p>
      ) : state.status === "error" ? (
        <p className="empty-hint">無法載入（{state.message}）</p>
      ) : state.tasks.length === 0 ? (
        <p className="empty-hint">沒有未完成的待辦</p>
      ) : (
        <>
          {state.tasks.slice(0, LIMIT).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
              <span className="min-w-0 truncate">
                {t.pinned ? "📌 " : ""}
                {titleOf(t.content)}
                {t.dueDate ? <span className="form-hint ml-2">到期 {t.dueDate.slice(5).replace("-", "/")}</span> : null}
              </span>
              <button type="button" className="btn btn-outline btn-sm flex-none" onClick={() => void complete(t)}>
                ✓ 完成
              </button>
            </div>
          ))}
          {state.tasks.length > LIMIT && <p className="form-hint mt-2">還有 {state.tasks.length - LIMIT} 筆，到待辦事項頁查看</p>}
        </>
      )}
    </div>
  );
}
