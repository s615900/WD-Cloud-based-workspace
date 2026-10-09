"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// 讀出這個環境實際的狀態：是不是主畫面 App、上方安全區域幾 px、畫面高度
export function Probe({ style, meta }: { style: string; meta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInfo({
      "是主畫面 App": String(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true),
      "上方安全區域": cs.paddingTop,
      "下方安全區域": cs.paddingBottom,
      "視窗高度": `${window.innerHeight}px`,
      "螢幕高度": `${screen.height}px`,
      "系統版本": /OS (\d+[_\d]*)/.exec(navigator.userAgent)?.[1]?.replaceAll("_", ".") ?? navigator.userAgent.slice(0, 60),
    });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div ref={ref} className="bg-navy text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="px-4 py-3 text-base font-bold">這是深藍頂列（測試 {style}）</div>
      </div>
      <div className="p-4 text-sm leading-relaxed">
        <p className="mb-3">
          狀態列樣式：<b>{meta}</b>
        </p>
        <table className="mb-4 w-full border-collapse">
          <tbody>
            {Object.entries(info).map(([k, v]) => (
              <tr key={k} className="border-b border-line">
                <td className="py-1.5 text-muted">{k}</td>
                <td className="py-1.5 text-right font-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mb-2 font-bold">請截圖給我，並告訴我：</p>
        <ol className="ml-5 list-decimal space-y-1 text-muted">
          <li>最上方狀態列（時間、電量那一條）是什麼顏色？有沒有漸層？</li>
          <li>時間是白字還是黑字？</li>
          <li>狀態列和深藍頂列之間有沒有分界？</li>
        </ol>
        <p className="mt-4 text-muted">
          三個版本：
          <Link className="mx-1 underline" href="/pwa-test/black">black</Link>
          <Link className="mx-1 underline" href="/pwa-test/default">default</Link>
          <Link className="mx-1 underline" href="/pwa-test/translucent">translucent</Link>
        </p>
      </div>
    </div>
  );
}
