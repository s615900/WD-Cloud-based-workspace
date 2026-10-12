"use client";

import { useEffect, useState } from "react";
import { Message, Modal, ModalActions, type MessageState } from "@/components/ui";
import { addDays, apiFetch, errorText, sendJson, weekdayOf, WEEKDAYS } from "@/lib/client";
import type { RosterTemplate } from "@/lib/types";

const COLORS = ["#3D6FD1", "#E07A28", "#7C56C9", "#C2415B", "#0E8A8A", "#5A6570"];

// 依現有模板編號（S-0001、S-0002…）算出下一個；沒有任何符合格式的就從 S-0001 開始。
// 包含停用的模板，避免跟停用中的舊編號撞號。
export function nextTemplateCode(codes: string[]): string {
  let max = 0;
  for (const c of codes) {
    const m = /^S-(\d+)$/.exec(c.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `S-${String(max + 1).padStart(4, "0")}`;
}

export function NewTemplateModal({
  templateCount,
  onClose,
  onSaved,
}: {
  templateCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [order, setOrder] = useState(String(templateCount));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [color, setColor] = useState(COLORS[templateCount % COLORS.length]);
  const [rate, setRate] = useState("");
  const [breakMin, setBreakMin] = useState("0");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  // 開啟時自動帶入下一個編號；使用者已經自己輸入了就不覆蓋
  useEffect(() => {
    apiFetch<RosterTemplate[]>("/api/roster/templates").then(
      (list) => setCode((cur) => cur || nextTemplateCode(list.map((t) => t.code))),
      () => {},
    );
  }, []);

  async function save() {
    if (!name.trim()) return setMessage({ text: "請輸入名稱", kind: "error" });
    if (!code.trim()) return setMessage({ text: "請輸入模板編號", kind: "error" });
    setSaving(true);
    setMessage({ text: "儲存中…" });
    try {
      await sendJson("/api/roster/templates", "POST", {
        code: code.trim(),
        name: name.trim(),
        start,
        end,
        color,
        order: Number(order),
        active: true,
        // 預排班算薪資用；Ragic 模板表尚未加欄位時，後端會略過這兩個值
        rate: Number(rate) || 0,
        breakMin: Number(breakMin) || 0,
      });
      onSaved();
    } catch (err) {
      setMessage({ text: errorText(err, "儲存失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="新增班別模板">
      <div className="form-grid">
        <div className="form-field sm:col-span-2">
          <label>名稱</label>
          <input className="input" value={name} placeholder="例如：早班" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-field">
          <label>模板編號（自動帶入，可修改）</label>
          <input className="input" value={code} placeholder="例如：S-0001" onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="form-field">
          <label>排序</label>
          <input className="input" type="number" step={1} value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
        <div className="form-field">
          <label>開始時間</label>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="form-field">
          <label>結束時間</label>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="form-field">
          <label>時薪（預排班算薪資用，可留空）</label>
          <input className="input" type="number" min={0} value={rate} placeholder="例如：190" onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="form-field">
          <label>不計薪休息（分鐘）</label>
          <input className="input" type="number" min={0} step={5} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />
        </div>
        <div className="form-field sm:col-span-2">
          <label>顏色</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                className={`size-7 cursor-pointer rounded-lg border-2 ${c === color ? "border-navy" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <Message state={message} />
      <ModalActions>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          取消
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          儲存模板
        </button>
      </ModalActions>
    </Modal>
  );
}

// 依星期＋日期範圍＋間隔展開成實際要建立的日期
function expandRepeatDates(from: string, to: string, every: number, dows: Set<number>): string[] {
  if (!from || !to || dows.size === 0) return [];
  const out: string[] = [];
  let cursor = from;
  let weekIndex = 0;
  let lastDow = -1;
  while (cursor <= to) {
    const dow = weekdayOf(cursor);
    if (dow === 0 && lastDow !== -1) weekIndex++;
    if (dows.has(dow) && weekIndex % every === 0) out.push(cursor);
    lastDow = dow;
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function RepeatModal({
  template,
  defaultFrom,
  onClose,
  onDone,
}: {
  template: RosterTemplate;
  defaultFrom: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dows, setDows] = useState<Set<number>>(new Set());
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(addDays(defaultFrom, 27));
  const [every, setEvery] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  const dates = expandRepeatDates(from, to, every, dows);

  function toggleDow(d: number) {
    setDows((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function save() {
    if (dates.length === 0) return setMessage({ text: "請先選星期", kind: "error" });
    setSaving(true);
    setMessage({ text: "建立中…" });
    try {
      const result = await sendJson<{ succeeded: number; total: number }>("/api/roster/schedule/repeat", "POST", {
        templateCode: template.code,
        dates,
      });
      onDone();
      alert(`已建立 ${result.succeeded} / ${result.total} 筆排班`);
    } catch (err) {
      setMessage({ text: errorText(err, "建立失敗"), kind: "error" });
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`重複排班：${template.name}`}>
      <p className="-mt-2 mb-3 text-sm text-muted">
        {template.start} – {template.end}
      </p>
      <div className="form-field mb-3">
        <label>每週哪幾天</label>
        <div className="flex gap-1.5">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => toggleDow(i)}
              className={`size-9 cursor-pointer rounded-[9px] border-[1.5px] text-[13px] font-bold ${
                dows.has(i) ? "border-navy bg-navy text-white" : "border-line bg-white text-muted"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label>從</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-field">
          <label>到</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="form-field sm:col-span-2">
          <label>間隔</label>
          <select className="input" value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            <option value={1}>每週</option>
            <option value={2}>隔週</option>
          </select>
        </div>
      </div>
      <p className="form-hint mt-2.5">
        {dows.size === 0 ? "還沒選星期" : `將建立 ${dates.length} 筆排班，同組會標上排班群組編號，可整組刪除。`}
      </p>
      <Message state={message} />
      <ModalActions>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          取消
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          建立排班
        </button>
      </ModalActions>
    </Modal>
  );
}

// 分享空檔：先用 dryRun 預覽完整時段清單，確認後才真的公布＋推播 LINE
export function PublishModal({ publishDays, onClose }: { publishDays?: number; onClose: () => void }) {
  const [text, setText] = useState("載入中…");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  useEffect(() => {
    apiFetch<{ text: string }>("/api/roster/publish?dryRun=1", { method: "POST" }).then(
      (r) => setText(r.text),
      (err) => {
        setText("");
        setMessage({ text: errorText(err, "預覽失敗"), kind: "error" });
      },
    );
  }, []);

  async function send() {
    setSending(true);
    setMessage({ text: "推播中…" });
    try {
      await apiFetch("/api/roster/publish", { method: "POST" });
      onClose();
    } catch (err) {
      setMessage({ text: errorText(err, "推播失敗"), kind: "error" });
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="公布預覽">
      <p className="-mt-2 mb-3 text-sm text-muted">送到 LINE 的內容，未來 {publishDays ?? ""} 天內的空檔</p>
      <pre className="max-h-[360px] overflow-y-auto rounded-[10px] bg-page p-3.5 font-sans text-[13px] leading-[1.7] whitespace-pre-wrap">
        {text}
      </pre>
      <Message state={message} />
      <ModalActions>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          再改一下
        </button>
        <button type="button" className="btn btn-primary" disabled={sending} onClick={send}>
          送出
        </button>
      </ModalActions>
    </Modal>
  );
}
