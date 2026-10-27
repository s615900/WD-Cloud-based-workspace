import type { Metadata } from "next";
import { TimelineView } from "./TimelineView";

export const metadata: Metadata = { title: "時間線" };

// 測試頁：行程和待辦排在同一條時間線上（尚未放進導覽列，直接開 /desktop/timeline）
export default function TimelinePage() {
  return <TimelineView />;
}
