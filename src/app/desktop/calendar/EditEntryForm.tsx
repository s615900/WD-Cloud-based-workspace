"use client";

// 編輯一筆行程（標題、日期、開始／結束時間）。行事曆當日面板與待辦事項頁共用，
// 存檔走 PATCH /api/roster/schedule/:id；個人行程同時會同步到 Google 日曆。
import { useState } from "react";
import { Message, type MessageState } from "@/components/ui";
import { errorText, sendJson } from "@/lib/client";

export interface EditableEntry {
  id: number;
  title: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  allDay: boolean;
}

export function EditEntryForm({
  entry,
  onCancel,
  onSaved,
}: {
  entry: EditableEntry;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [date, setDate] = useState(entry.date);
  const [start, setStart] = useState(entry.start);
  const [end, setEnd] = useState(entry.end);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setMessage({ text: "請輸入標題", kind: "error" });
      return;
    }
    if (!date) {
      setMessage({ text: "請選擇日期", kind: "error" });
      return;
    }
    if (!entry.allDay && (!start || !end || end <= start)) {
      setMessage({ text: "結束時間要晚於開始時間", kind: "error" });
      return;
    }
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      await sendJson(`/api/roster/schedule/${entry.id}`, "PATCH", {
        title: title.trim(),
        date,
        ...(entry.allDay ? {} : { start, end }),
      });
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="form-grid">
        <div className="form-field sm:col-span-2">
          <label>標題</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-field sm:col-span-2">
          <label>日期</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {entry.allDay ? null : (
          <>
            <div className="form-field">
              <label>開始</label>
              <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="form-field">
              <label>結束</label>
              <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <Message state={message} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          儲存
        </button>
      </div>
    </form>
  );
}
