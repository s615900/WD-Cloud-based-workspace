"use client";

// 倒數日卡片：行事曆行程標了「倒數日」的會列在這裡（首頁只列最近幾筆，待辦事項頁列全部）。
// 卡片本身就能新增、編輯、移除，不用跳到行事曆。從這裡新增的會是行事曆上的「全天」個人行程。
import { useCallback, useEffect, useState } from "react";
import { Message, Modal, ModalActions, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson, todayISO } from "@/lib/client";

interface CountdownItem {
  id: number;
  title: string;
  date: string; // 下一次的日期
  originalDate: string; // 行程本身的日期
  yearly: boolean;
  daysLeft: number;
}

type Editing = { mode: "new" } | { mode: "edit"; item: CountdownItem };

export function CountdownCard({ limit }: { limit?: number }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: CountdownItem[] }>({
    status: "loading",
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    apiFetch<CountdownItem[]>("/api/countdowns").then(
      (items) => setState({ status: "ok", items }),
      (err) => setState({ status: "error", message: errorText(err) }),
    );
  }, [tick]);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="mb-0">倒數日</h3>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing({ mode: "new" })}>
          + 新增
        </button>
      </div>
      {state.status === "loading" ? (
        <p className="empty-hint">載入中…</p>
      ) : state.status === "error" ? (
        <p className="empty-hint">無法載入（{state.message}）</p>
      ) : state.items.length === 0 ? (
        <p className="empty-hint">還沒有倒數日，按右上角「+ 新增」</p>
      ) : (
        (limit ? state.items.slice(0, limit) : state.items).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEditing({ mode: "edit", item: c })}
            className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line bg-transparent py-2 text-left"
            title="點一下編輯"
          >
            <span className="min-w-0">
              {c.title}
              <span className="form-hint ml-2">
                {c.date.slice(5).replace("-", "/")}
                {c.yearly ? "・每年" : ""}
              </span>
            </span>
            <b className={`flex-none whitespace-nowrap ${c.daysLeft === 0 ? "text-gold" : "text-navy"}`}>{c.daysLeft === 0 ? "就是今天" : `還有 ${c.daysLeft} 天`}</b>
          </button>
        ))
      )}

      {editing && (
        <CountdownForm
          key={editing.mode === "edit" ? editing.item.id : "new"}
          editing={editing.mode === "edit" ? editing.item : null}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CountdownForm({ editing, onClose, onChanged }: { editing: CountdownItem | null; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.originalDate ?? todayISO());
  const [yearly, setYearly] = useState(editing?.yearly ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setMessage({ text: "" });
    try {
      await fn();
      onChanged();
    } catch (err) {
      setMessage({ text: errorText(err, fallback), kind: "error" });
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setMessage({ text: "請輸入名稱", kind: "error" });
    if (!date) return setMessage({ text: "請選擇日期", kind: "error" });
    void run(
      () =>
        editing
          ? sendJson(`/api/roster/schedule/${editing.id}`, "PATCH", { title: title.trim(), date, countdown: true, yearly })
          : sendJson("/api/roster/schedule", "POST", { title: title.trim(), date, allDay: true, countdown: true, yearly }),
      "儲存失敗",
    );
  }

  return (
    <Modal open onClose={onClose} title={editing ? "編輯倒數日" : "新增倒數日"}>
      <form onSubmit={save}>
        <div className="form-field">
          <label>名稱</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：生日、出國" />
        </div>
        <div className="form-field">
          <label>日期</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          每年重複（國曆）
        </label>
        {!editing && <p className="form-hint">會同時在行事曆上新增一筆「全天」行程。</p>}
        <Message state={message} />
        <ModalActions>
          {editing && (
            <>
              <button
                type="button"
                className="btn btn-outline mr-auto"
                disabled={busy}
                onClick={() => {
                  if (!confirm("取消這個倒數日？行事曆上的行程會保留。")) return;
                  void run(() => sendJson(`/api/roster/schedule/${editing.id}`, "PATCH", { countdown: false, yearly: false }), "取消失敗");
                }}
              >
                取消倒數
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm("連同行事曆上的這個行程一起刪除？")) return;
                  void run(() => apiFetch(`/api/roster/schedule/${editing.id}`, { method: "DELETE" }), "刪除失敗");
                }}
              >
                刪除行程
              </button>
            </>
          )}
          <button type="button" className="btn btn-outline" onClick={onClose}>
            關閉
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            儲存
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
