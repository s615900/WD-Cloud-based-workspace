"use client";

// 行事曆右側：當日詳情（行程清單、空檔清單、快速新增個人行程）
import { useEffect, useState } from "react";
import { Message, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson, weekdayOf, WEEKDAYS } from "@/lib/client";
import type { FreeSlot, RosterEntry } from "@/lib/types";

function toMinutes(hm: string): number {
  const [h, m] = (hm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}小時`;
  return `${h}小時${m}分`;
}

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; date: string; entries: RosterEntry[]; slots: FreeSlot[] };

export function DayPanel({ date, version, onChanged }: { date: string; version: number; onChanged: () => void }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [entries, free] = await Promise.all([
          apiFetch<RosterEntry[]>(`/api/roster/schedule?date=${date}`),
          apiFetch<{ slots: FreeSlot[] }>(`/api/roster/free-slots?date=${date}`),
        ]);
        entries.sort((a, b) => a.start.localeCompare(b.start));
        if (alive) setState({ status: "ok", date, entries, slots: free.slots });
      } catch (err) {
        if (alive) setState({ status: "error", message: errorText(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [date, version]);

  async function act(run: () => Promise<unknown>, fallback: string) {
    try {
      await run();
      onChanged();
    } catch (err) {
      alert(errorText(err, fallback));
    }
  }

  let body;
  if (state.status === "error") {
    body = <p className="empty-hint">無法載入（{state.message}）</p>;
  } else if (state.status === "loading" || state.date !== date) {
    body = <p className="empty-hint">載入中…</p>;
  } else {
    body = (
      <>
        <p className="section-label">行程</p>
        {state.entries.length === 0 ? (
          <p className="empty-hint">這天沒有行程</p>
        ) : (
          state.entries.map((e) => (
            <div key={e.id} className="mb-2 rounded-[9px] border border-line px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold">{e.title}</span>
                <span className={`badge ${e.status === "取消" ? "badge-danger" : "badge-teal"}`}>{e.status}</span>
              </div>
              <div className="text-xs text-muted">{e.allDay ? "全天" : `${e.start} – ${e.end}`}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="btn btn-outline px-2.5 py-1 text-xs"
                  onClick={() =>
                    act(
                      () => sendJson(`/api/roster/schedule/${e.id}`, "PATCH", { status: e.status === "取消" ? "正常" : "取消" }),
                      "更新失敗",
                    )
                  }
                >
                  {e.status === "取消" ? "恢復" : "取消"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-2.5 py-1 text-xs"
                  onClick={() => {
                    if (!confirm("確定刪除這筆行程？")) return;
                    act(() => apiFetch(`/api/roster/schedule/${e.id}`, { method: "DELETE" }), "刪除失敗");
                  }}
                >
                  刪除
                </button>
                {e.batchId && (
                  <button
                    type="button"
                    className="btn btn-danger px-2.5 py-1 text-xs"
                    onClick={() => {
                      if (!confirm("確定刪除整組排班？此動作無法復原。")) return;
                      act(
                        () => apiFetch(`/api/roster/schedule/batch/${encodeURIComponent(e.batchId)}`, { method: "DELETE" }),
                        "刪除失敗",
                      );
                    }}
                  >
                    整組刪除
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        <p className="section-label">空檔（依目前緩衝／最短空檔規則推算）</p>
        {state.slots.length === 0 ? (
          <p className="empty-hint">這天沒有空檔</p>
        ) : (
          state.slots.map((s) => (
            <div key={s.start} className="mb-1.5 flex items-center justify-between">
              <span className="badge badge-gold">
                {s.start} – {s.end}
              </span>
              <span className="form-hint">{formatDuration(toMinutes(s.end) - toMinutes(s.start))}</span>
            </div>
          ))
        )}

        <QuickAdd key={date} date={date} onAdded={onChanged} />
      </>
    );
  }

  return (
    <section className="card self-start">
      <h3>
        {date.slice(5).replace("-", "/")}（{WEEKDAYS[weekdayOf(date)]}）
      </h3>
      {body}
    </section>
  );
}

function QuickAdd({ date, onAdded }: { date: string; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function add() {
    if (!title.trim()) {
      setMessage({ text: "請輸入標題", kind: "error" });
      return;
    }
    try {
      await sendJson("/api/roster/schedule", "POST", { date, title: title.trim(), start, end });
      setTitle("");
      setMessage({ text: "" });
      onAdded();
    } catch (err) {
      setMessage({ text: errorText(err, "新增失敗"), kind: "error" });
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3.5">
      <p className="section-label">新增個人行程</p>
      <div className="form-grid">
        <div className="form-field sm:col-span-2">
          <label>標題</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-field">
          <label>開始</label>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="form-field">
          <label>結束</label>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn-primary mt-3 w-full" onClick={add}>
        新增
      </button>
      <Message state={message} />
    </div>
  );
}
