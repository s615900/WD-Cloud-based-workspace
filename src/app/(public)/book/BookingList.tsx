"use client";

import { useEffect, useRef, useState } from "react";
import { CenterNote, DayBlock } from "@/components/public/PublicHeader";

interface BookDay {
  date: string;
  dayLabel: string;
  slots: { id: number; start: string; end: string }[];
}

interface Target {
  id: number;
  dateLabel: string;
  timeLabel: string;
}

function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(11,61,92,0.45)]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[480px] rounded-t-[20px] bg-white px-5 pt-[22px] pb-[calc(env(safe-area-inset-bottom)+20px)]">
        {children}
      </div>
    </div>
  );
}

export function BookingList() {
  const [days, setDays] = useState<BookDay[] | "error" | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [name, setName] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    fetch("/api/book")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setDays)
      .catch((err) => {
        console.error("載入可預約時段失敗:", err);
        setDays("error");
      });
  }, [reloadCount]);

  function showToast(text: string, error = false) {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function open(t: Target) {
    setTarget(t);
    setName("");
    setModalMsg("");
  }

  async function submit() {
    if (!target) return;
    const trimmed = name.trim();
    if (!trimmed) return setModalMsg("請輸入你的名字");
    if (trimmed.length > 20) return setModalMsg("名字請控制在 20 字以內");

    setSubmitting(true);
    setModalMsg("");
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(target.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setTarget(null);
        showToast(data.error || "這個時段剛被別人預約走了，請選別的時段", true);
        setReloadCount((n) => n + 1);
        return;
      }
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

      // 預約成功後直接把那個時段從畫面上移除；該日期沒有其他時段就整天移除
      setDays((prev) =>
        Array.isArray(prev)
          ? prev
              .map((d) => ({ ...d, slots: d.slots.filter((s) => s.id !== target.id) }))
              .filter((d) => d.slots.length > 0)
          : prev,
      );
      setConfirmation(`已送出 ${target.dateLabel} ${target.timeLabel} 的預約申請，等 WD 確認後才成立`);
      setTarget(null);
    } catch (err) {
      console.error("預約失敗:", err);
      setModalMsg("送出失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  let list;
  if (days === null) list = <CenterNote>載入中…</CenterNote>;
  else if (days === "error") list = <CenterNote>載入失敗，請稍後再試</CenterNote>;
  else if (days.length === 0) list = <CenterNote>目前沒有可預約的時段</CenterNote>;
  else
    list = days.map((day) => {
      const dateLabel = day.dayLabel || day.date;
      return (
        <DayBlock key={day.date} title={dateLabel}>
          {day.slots.length ? (
            day.slots.map((slot) => {
              const timeLabel = `${slot.start} - ${slot.end}`;
              return (
                <div
                  key={slot.id}
                  className="flex items-center justify-between gap-2.5 border-t border-[#EEF1F4] py-2.5 first:border-t-0"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="size-[9px] shrink-0 rounded-full bg-[#6FCF97]" />
                    <span className="text-[15px] font-semibold">{timeLabel}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-[10px] bg-gold px-3.5 py-[9px] text-[13px] font-bold text-white"
                    onClick={() => open({ id: slot.id, dateLabel, timeLabel })}
                  >
                    預約這個時段
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-[13.5px] text-muted">這天沒有可預約的時段了</p>
          )}
        </DayBlock>
      );
    });

  const sheetButton = "flex-1 cursor-pointer rounded-xl py-[13px] text-[14.5px] font-bold";

  return (
    <>
      {list}

      {target && (
        <BottomSheet onClose={() => setTarget(null)}>
          <p className="mb-1 text-base font-bold">
            預約 {target.dateLabel} {target.timeLabel}
          </p>
          <p className="mb-4 text-[13px] text-muted">請輸入你的名字，WD 會收到通知</p>
          <input
            autoFocus
            className="w-full rounded-xl border border-[#E0E4E8] bg-page px-3.5 py-3 text-[15px]"
            placeholder="你的名字"
            autoComplete="off"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !submitting) submit();
            }}
          />
          <p className="mt-2 min-h-4 text-[12.5px] text-[#D64545]">{modalMsg}</p>
          <div className="mt-4 flex gap-2.5">
            <button type="button" className={`${sheetButton} bg-page`} onClick={() => setTarget(null)}>
              取消
            </button>
            <button
              type="button"
              className={`${sheetButton} bg-navy text-white disabled:cursor-default disabled:opacity-60`}
              disabled={!name.trim() || submitting}
              onClick={submit}
            >
              {submitting ? "送出中…" : "送出預約"}
            </button>
          </div>
        </BottomSheet>
      )}

      {confirmation && (
        <BottomSheet onClose={() => setConfirmation("")}>
          <p className="mt-1 mb-3 text-center text-[40px]">📨</p>
          <p className="mb-5 text-center text-[15.5px] leading-normal font-semibold">{confirmation}</p>
          <button type="button" className={`${sheetButton} w-full bg-navy text-white`} onClick={() => setConfirmation("")}>
            返回列表
          </button>
        </BottomSheet>
      )}

      <div
        className={`pointer-events-none fixed bottom-7 left-1/2 z-50 max-w-[calc(100%-40px)] -translate-x-1/2 rounded-full px-5 py-3 text-center text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(11,61,92,0.3)] transition-opacity ${
          toast ? "opacity-100" : "opacity-0"
        } ${toast?.error ? "bg-[#D64545]" : "bg-navy"}`}
      >
        {toast?.text}
      </div>
    </>
  );
}
