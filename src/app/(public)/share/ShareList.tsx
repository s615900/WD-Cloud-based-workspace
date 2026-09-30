"use client";

import { useEffect, useState } from "react";
import { CenterNote, DayBlock } from "@/components/public/PublicHeader";

interface ShareDay {
  date: string;
  dayLabel: string;
  slots: { start: string; end: string; bookingStatus?: string; bookedBy?: string }[];
}

export function ShareList() {
  const [days, setDays] = useState<ShareDay[] | "error" | null>(null);

  useEffect(() => {
    fetch("/api/share")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setDays)
      .catch((err) => {
        console.error("載入分享空檔失敗:", err);
        setDays("error");
      });
  }, []);

  if (days === null) return <CenterNote>載入中…</CenterNote>;
  if (days === "error") return <CenterNote>載入失敗，請稍後再試</CenterNote>;
  if (days.length === 0) return <CenterNote>目前還沒有安排空檔時間</CenterNote>;

  return days.map((day) => (
    <DayBlock key={day.date} title={day.dayLabel || day.date}>
      {day.slots?.length ? (
        day.slots.map((slot) => {
          const status = slot.bookingStatus || "可預約";
          const dot = status === "已預約" ? "bg-[#E0A83E]" : status === "已取消" ? "bg-[#B0B8C1]" : "bg-[#6FCF97]";
          return (
            <div key={`${slot.start}-${slot.end}`} className="flex items-center gap-2.5 border-t border-[#EEF1F4] py-[9px] first:border-t-0">
              <span className={`size-[9px] shrink-0 rounded-full ${dot}`} />
              <span className="text-[15px] font-semibold">
                {slot.start} - {slot.end}
              </span>
              {status === "已預約" && slot.bookedBy && <span className="ml-1 text-[13px] text-muted">（{slot.bookedBy}）</span>}
            </div>
          );
        })
      ) : (
        <p className="text-[13.5px] text-muted">這天還沒安排空檔時間</p>
      )}
    </DayBlock>
  ));
}
