"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyRow, Message, Modal, ModalActions, PageHeader, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson } from "@/lib/client";
import { useHideDone } from "@/lib/taskPrefs";
import type { TaskListItem } from "@/lib/types";
import { EditEntryForm } from "../calendar/EditEntryForm";
import { CountdownCard } from "../CountdownCard";

// 「備忘」是內部沿用的類型值，顯示給使用者看的文字一律用「待辦」
const labelForType = (type: string) => (type === "備忘" ? "待辦" : type);

// 清單顯示用：多行內容只顯示第一行當標題（去掉開頭的 # > - 符號）
const titleOf = (content: string) => {
  const lines = content.split("\n");
  const first = (lines[0] ?? "").replace(/^\s*(#{1,3}\s+|>\s?|[-*]\s+)/, "");
  return lines.length > 1 ? `${first} …` : first;
};

// 清單上「連續日期、同名、同時間、同狀態」的行程（例如多天賽事每天一筆）合併成一列顯示；
// run 是這一列包含的所有每日紀錄，完成／還原會一起套用，編輯則開第一天那筆。
type ListRow = TaskListItem & { run?: TaskListItem[] };

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

function mergeRuns(tasks: TaskListItem[]): ListRow[] {
  const groups = new Map<string, TaskListItem[]>();
  for (const t of tasks) {
    if (t.source !== "schedule" || !t.isoDate) continue;
    const key = [t.type, t.content, t.time, t.endTime ?? "", t.status].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const runOf = new Map<TaskListItem, TaskListItem[]>();
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => (a.isoDate ?? "").localeCompare(b.isoDate ?? ""));
    let run: TaskListItem[] = [];
    for (const t of sorted) {
      const prev = run[run.length - 1];
      if (prev && dayNumber(t.isoDate!) - dayNumber(prev.isoDate!) !== 1) run = [];
      run.push(t);
      for (const m of run) runOf.set(m, run);
    }
  }
  const out: ListRow[] = [];
  const emitted = new Set<TaskListItem[]>();
  for (const t of tasks) {
    const run = runOf.get(t);
    if (!run || run.length < 2) {
      out.push(t);
      continue;
    }
    if (emitted.has(run)) continue;
    emitted.add(run);
    out.push({ ...run[0], run });
  }
  return out;
}

// 合併列的日期顯示：11/13–11/18 08:00
function dateLabel(t: ListRow): string {
  if (!t.date) return t.dueDate ? `到期 ${t.dueDate}` : "（未排定）";
  const time = t.time ? ` ${t.time}` : "";
  const last = t.run?.[t.run.length - 1];
  return last && last.date !== t.date ? `${t.date}–${last.date}${time}` : `${t.date}${time}`;
}

type Rows = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; tasks: TaskListItem[] };

export function TasksView() {
  const router = useRouter();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [editing, setEditing] = useState<TaskListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const hideDone = useHideDone();
  const [toggleError, setToggleError] = useState("");
  // 篩選條件或 reloadCount 改變就重新查詢；結果帶著查詢當下的 key，key 對不上就視為載入中
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${type}|${status}|${appliedKeyword}|${reloadCount}|${hideDone}`;
  const [result, setResult] = useState<{ key: string; rows: Rows } | null>(null);
  const rows: Rows = result?.key === requestKey ? result.rows : { status: "loading" };
  const shown = rows.status === "ok" ? mergeRuns(rows.tasks) : [];

  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (appliedKeyword) query.set("keyword", appliedKeyword);
    apiFetch<TaskListItem[]>(`/api/tasks${query.size ? `?${query}` : ""}`).then(
      (all) => alive && setResult({ key: requestKey, rows: { status: "ok", tasks: status ? all.filter((t) => t.status === status) : hideDone ? all.filter((t) => t.status !== "完成") : all } }),
      (err) => alive && setResult({ key: requestKey, rows: { status: "error", message: errorText(err) } }),
    );
    return () => {
      alive = false;
    };
  }, [type, status, appliedKeyword, hideDone, requestKey]);

  // 直接在清單上切換完成／準備中，不用開彈窗
  async function toggleDone(t: ListRow) {
    setToggleError("");
    try {
      const status = t.status === "完成" ? "準備中" : "完成";
      await Promise.all((t.run ?? [t]).map((x) => sendJson(`/api/tasks/${x.id}`, "PATCH", { status, source: x.source ?? "todo" })));
      setReloadCount((n) => n + 1);
    } catch (err) {
      setToggleError(errorText(err, "更改狀態失敗"));
    }
  }

  // 釘選／取消釘選（只有待辦，行程沒有）
  async function togglePin(t: TaskListItem) {
    setToggleError("");
    try {
      await sendJson(`/api/tasks/${t.id}`, "PATCH", { pinned: !t.pinned, source: "todo" });
      setReloadCount((n) => n + 1);
    } catch (err) {
      setToggleError(errorText(err, "釘選失敗"));
    }
  }

  // 行程（/ragicforms21/8）與待辦（/ragicforms21/1）都開各自的編輯彈窗。
  // 推播通知帶 ?id=123&src=todo|schedule：資料載入後自動開啟那一筆（只開一次）
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || rows.status !== "ok") return;
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    if (!params.get("id") || !Number.isFinite(id)) return;
    deepLinkDone.current = true;
    const src = params.get("src") === "schedule" ? "schedule" : "todo";
    const hit = rows.tasks.find((t) => t.id === id && (t.source ?? "todo") === src);
    // 找不到（已刪除或已完成而被篩掉）就維持原本的清單畫面
    if (hit) openItem(hit);
  }, [rows]);

  function openItem(t: TaskListItem) {
    setEditing(t);
  }

  return (
    <>
      <PageHeader title="待辦事項" subtitle="個人行程／待辦的完整清單，跟 LINE Bot 任務資料庫一致" />

      <div className="mb-5">
        <CountdownCard />
      </div>

      <div className="mb-3 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + 新增待辦
        </button>
      </div>

      <div className="card mb-5">
        <div className="grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap md:gap-4">
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
              <option value="取消">取消</option>
            </select>
          </div>
          <div className="form-field col-span-2 min-w-[220px] flex-1">
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
            className="btn btn-outline col-span-2 md:col-span-1"
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

      {toggleError ? <p className="mb-3 text-sm text-danger">{toggleError}</p> : null}

      {/* 手機：卡片清單 */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.status === "loading" ? (
          <p className="empty-hint">載入中…</p>
        ) : rows.status === "error" ? (
          <p className="empty-hint">無法載入（{rows.message}）</p>
        ) : rows.tasks.length === 0 ? (
          <p className="empty-hint">沒有符合的待辦事項</p>
        ) : (
          shown.map((t, idx) => (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              className="list-card"
              onClick={() => openItem(t)}
              onKeyDown={(e) => e.key === "Enter" && openItem(t)}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className={`badge ${t.status === "完成" ? "badge-teal" : t.status === "取消" ? "badge-muted" : "badge-gold"}`}>{t.status}</span>
                <span className={`badge ${t.type === "行程" ? "badge-teal" : "badge-muted"}`}>{labelForType(t.type)}</span>
                <DoneButton task={t} onToggle={toggleDone} className="ml-auto" />
              </div>
              <div className="font-semibold">
                {t.pinned ? "📌 " : ""}
                {titleOf(t.content)}
              </div>
              <div className="mt-1 text-xs text-muted">
                {dateLabel(t)}　建立 {t.createdAt}{t.dueDate ? `　到期 ${t.dueDate}` : ""}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 平板／電腦：表格 */}
      <div className="card hidden overflow-x-auto md:block">
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
              shown.map((t, idx) => (
                <tr key={idx} className="cursor-pointer" onClick={() => openItem(t)}>
                  <td>
                    <span className={`badge ${t.status === "完成" ? "badge-teal" : t.status === "取消" ? "badge-muted" : "badge-gold"}`}>{t.status}</span>
                  </td>
                  <td>
                    <span className={`badge ${t.type === "行程" ? "badge-teal" : "badge-muted"}`}>{labelForType(t.type)}</span>
                  </td>
                  <td>
                    {t.pinned ? "📌 " : ""}
                    {titleOf(t.content)}
                  </td>
                  <td className="whitespace-nowrap">
                    {dateLabel(t)}
                  </td>
                  <td className="form-hint whitespace-nowrap">{t.createdAt}</td>
                  <td className="whitespace-nowrap">
                    <DoneButton task={t} onToggle={toggleDone} />{" "}
                    {t.source !== "schedule" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void togglePin(t);
                          }}
                        >
                          {t.pinned ? "取消釘選" : "📌 釘選"}
                        </button>{" "}
                      </>
                    )}
                    <button type="button" className="btn btn-outline btn-sm">
                      編輯
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <EditTaskModal
          task={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setReloadCount((n) => n + 1);
          }}
        />
      )}
      {editing?.source === "schedule" && (
        <EditScheduleModal
          task={editing}
          onClose={() => setEditing(null)}
          onViewInCalendar={(iso) => router.push(`/desktop/calendar?date=${iso}`)}
          onSaved={() => {
            setEditing(null);
            setReloadCount((n) => n + 1);
          }}
        />
      )}
      {editing && editing.source !== "schedule" && (
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

// 完成／還原按鈕；取消的行程要到行事曆恢復，這裡不給按
function DoneButton({ task, onToggle, className = "" }: { task: ListRow; onToggle: (t: ListRow) => void; className?: string }) {
  if (task.status === "取消") return null;
  const done = task.status === "完成";
  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(task);
      }}
    >
      {done ? "還原" : "✓ 完成"}
    </button>
  );
}

// task 為 null＝新增待辦；有值＝編輯原有的待辦（原本的欄位與儲存行為不變，多了釘選）
function EditTaskModal({ task, onClose, onSaved }: { task: TaskListItem | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(task?.status === "完成" ? "完成" : "準備中");
  const [content, setContent] = useState(task?.content ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [pinned, setPinned] = useState(task?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setMessage({ text: "內容不可為空", kind: "error" });
      return;
    }
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      if (!task) {
        await sendJson("/api/tasks", "POST", {
          type: "備忘",
          content: content.trim(),
          ...(dueDate ? { dueDate } : {}),
          ...(pinned ? { pinned: true } : {}),
        });
      } else {
        // 到期日沒改就不送，避免 Ragic 還沒建「到期日」欄位時連狀態都存不了；釘選同理
        const dueChanged = dueDate !== (task.dueDate ?? "");
        const contentChanged = content.trim() !== task.content;
        const pinChanged = pinned !== (task.pinned ?? false);
        await sendJson(`/api/tasks/${task.id}`, "PATCH", {
          status,
          source: "todo",
          ...(contentChanged ? { content: content.trim() } : {}),
          ...(dueChanged ? { dueDate } : {}),
          ...(pinChanged ? { pinned } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={task ? "編輯待辦事項" : "新增待辦事項"}>
      <form onSubmit={save}>
        <div className="form-grid">
          {task && (
            <>
              <div className="form-field">
                <label>類型</label>
                <p>{labelForType(task.type)}</p>
              </div>
              <div className="form-field">
                <label>建立時間</label>
                <p>{task.createdAt}</p>
              </div>
            </>
          )}
          <div className="form-field sm:col-span-2">
            <label htmlFor="task-content">內容</label>
            <textarea
              id="task-content"
              className="input"
              rows={task ? 3 : 6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {task && (
            <div className="form-field sm:col-span-2">
              <label>狀態</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="準備中">準備中</option>
                <option value="完成">完成</option>
              </select>
            </div>
          )}
          <div className="form-field sm:col-span-2">
            <label htmlFor="task-due">到期日（選填，到期當天早上 9 點推播提醒）</label>
            <input id="task-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className="form-field sm:col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            📌 釘選（排在最上面，也不會被 14 天自動隱藏）
          </label>
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

function EditScheduleModal({
  task,
  onClose,
  onViewInCalendar,
  onSaved,
}: {
  task: TaskListItem;
  onClose: () => void;
  onViewInCalendar: (isoDate: string) => void;
  onSaved: () => void;
}) {
  const date = task.isoDate ?? "";
  return (
    <Modal open onClose={onClose} title="編輯行程">
      <EditEntryForm
        entry={{ id: task.id, title: task.content, date, start: task.time, end: task.endTime ?? "", allDay: !task.time }}
        onCancel={onClose}
        onSaved={onSaved}
      />
      {date ? (
        <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => onViewInCalendar(date)}>
          到行事曆查看這天
        </button>
      ) : null}
    </Modal>
  );
}
