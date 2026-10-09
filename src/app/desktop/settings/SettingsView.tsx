"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { apiFetch, errorText } from "@/lib/client";
import { PushCard } from "./PushCard";

interface DesktopSettings {
  userId: string | null;
  connections: { key: string; label: string; status: "connected" | "not_configured" }[];
}

const STATUS_LABEL = { connected: "已連線", not_configured: "未設定" };
const STATUS_CLASS = { connected: "badge-teal", not_configured: "badge-danger" };

export function SettingsView() {
  const [data, setData] = useState<DesktopSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<DesktopSettings>("/api/desktop-settings")
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, []);

  return (
    <div className="max-w-[640px]">
      <PageHeader title="設定" subtitle="連線狀態僅檢查環境變數是否存在，不會實際發送測試請求" />

      <div className="card mb-5">
        <h3>登入狀態</h3>
        {data ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="badge badge-teal">已登入</span> LINE User ID: {data.userId ?? ""}
            </span>
            {/* 登出是 Route Handler（會清 cookie 再轉址），用一般 <a> 而不是 <Link> */}
            <a className="btn btn-outline" href="/auth/logout">
              登出
            </a>
          </div>
        ) : (
          <p className="empty-hint">載入中…</p>
        )}
      </div>

      <PushCard />

      <div className="card">
        <h3>外部服務連線</h3>
        {error ? (
          <p className="empty-hint">無法載入（{error}）</p>
        ) : !data ? (
          <p className="empty-hint">載入中…</p>
        ) : (
          data.connections.map((c) => (
            <div key={c.key} className="flex justify-between border-b border-line py-2.5">
              <span>{c.label}</span>
              <span className={`badge ${STATUS_CLASS[c.status] ?? "badge-muted"}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
