"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyRow, Message, Modal, ModalActions, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import type { TaskListItem } from "@/lib/types";

// 「備忘」是內部沿用的類型值，顯示給使用者看的文字一律用「待辦」
const labelForType = (type: string) => (type === "備忘" ? "待辦" : type);

type Rows = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; tasks: TaskListItem[] };

export function TasksView() {
  const router = useRouter();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [editing, setEditing] = useState<TaskListItem | null>(null);
  // 篩選條件或 reloadCount 改變就重新查詢；結果帶著查詢當下的 key，key 對不上就視為載入中
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${type}|${status}|${appliedKeyword}|${reloadCount}`;
  const [result, setResult] = useState<{ key: string; rows: Rows } | null>(null);
  const rows: Rows = result?.key === requestKey ? result.rows : { status: "loading" };

  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (appliedKeyword) query.set("keyword", appliedKeyword);
    apiFetch<TaskListItem[]>(`/api/tasks${query.size ? `?${query}` : ""}`).then(
      (all) => alive && setResult({ key: requestKey, rows: { status: "ok", tasks: status ? all.filter((t) => t.status === status) : all } }),
      (err) => alive && setResult({ key: requestKey, rows: { status: "error", message: errorText(err) } }),
    );
    return () => {
      alive = false;
    };
  }, [type, status, appliedKeyword, requestKey]);

  // 排班行程（/ragicforms21/8）在這頁唯讀，點「檢視」直接導去行事曆對應日期；
  // 只有待辦（/ragicforms21/1）才會開編輯彈窗。
  function openItem(t: TaskListItem) {
    if (t.source === "schedule") {
      // createdAt 對排班行程來說就是「yyyy/mm/dd HH:mm:00」，取前 10 碼即可
      const iso = (t.createdAt || "").slice(0, 10).replaceAll("/", "-");
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) router.push(`/desktop/calendar?date=${iso}`);
      return;
    }
    setEditing(t);
  }

  return (
    <>
      <PageHeader title="待辦事項" subtitle="個人行程／待辦的完整清單，跟 LINE Bot 任務資料庫一致" />

      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="form-field min-w-[140px]">
            <label>類型</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">全部</option>
              <option value="行程">行程</option>
              <option value="備忘">待辦</option>
            </select>
          </div>
          <div className="form-field min-w-[140px]">
            <label>狀態</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="準備中">準備中</option>
              <option value="完成">完成</option>
            </select>
          </div>
          <div className="form-field min-w-[220px] flex-1">
            <label>關鍵字</label>
            <input
              className="input"
              value={keyword}
              placeholder="搜尋內容文字…（Enter 搜尋）"
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAppliedKeyword(keyword.trim());
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setType("");
              setStatus("");
              setKeyword("");
              setAppliedKeyword("");
            }}
          >
            清除篩選
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>狀態</th>
              <th>類型</th>
              <th>內容</th>
              <th>日期／時間</th>
              <th>建立時間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.status === "loading" ? (
              <EmptyRow colSpan={6}>載入中…</EmptyRow>
            ) : rows.status === "error" ? (
              <EmptyRow colSpan={6}>無法載入（{rows.message}）</EmptyRow>
            ) : rows.tasks.length === 0 ? (
              <EmptyRow colSpan={6}>沒有符合的待辦事項</EmptyRow>
            ) : (
              // 用陣列索引當 key：/ragicforms21/1 跟 /ragicforms21/8 的紀錄編號互不相干，可能撞號
              rows.tasks.map((t, idx) => (
                <tr key={idx} className="cursor-pointer" onClick={() => openItem(t)}>
                  <td>
                    <span className={`badge ${t.status === "完成" ? "badge-teal" : "badge-gold"}`}>{t.status}</span>
                  </td>
                  <td>
                    <span className={`badge ${t.type === "行程" ? "badge-teal" : "badge-muted"}`}>{labelForType(t.type)}</span>
                  </td>
                  <td>{t.content}</td>
                  <td>{t.date ? `${t.date}${t.time ? ` ${t.time}` : ""}` : "（未排定）"}</td>
                  <td className="form-hint">{t.createdAt}</td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm">
                      {t.source === "schedule" ? "檢視" : "編輯"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditTaskModal
          task={editing}
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

function EditTaskModal({ task, onClose, onSaved }: { task: TaskListItem; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(task.status === "完成" ? "完成" : "準備中");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      await sendJson(`/api/tasks/${task.id}`, "PATCH", { status, source: "todo" });
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="編輯待辦事項">
      <form onSubmit={save}>
        <div className="form-grid">
          <div className="form-field">
            <label>類型</label>
            <p>{labelForType(task.type)}</p>
          </div>
          <div className="form-field">
            <label>建立時間</label>
            <p>{task.createdAt}</p>
          </div>
          <div className="form-field sm:col-span-2">
            <label>內容</label>
            <p className="whitespace-pre-wrap">{task.content}</p>
          </div>
          <div className="form-field sm:col-span-2">
            <label>狀態</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="準備中">準備中</option>
              <option value="完成">完成</option>
            </select>
          </div>
        </div>
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
