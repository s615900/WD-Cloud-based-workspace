// 桌面版頁面共用的小型展示元件
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-navy max-sm:text-xl">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2.5 max-sm:w-full max-sm:flex-wrap max-sm:[&>*]:flex-auto">{actions}</div> : null}
    </div>
  );
}

export type MessageKind = "" | "success" | "error";
export interface MessageState {
  text: string;
  kind?: MessageKind;
}

export function Message({ state }: { state: MessageState }) {
  const color = state.kind === "success" ? "font-semibold text-teal" : state.kind === "error" ? "font-semibold text-danger" : "";
  return <p className={`mt-2.5 min-h-[18px] text-[13px] ${color}`}>{state.text}</p>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(11,37,61,0.45)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[calc(100vh-80px)] w-[560px] max-w-[calc(100vw-40px)] overflow-y-auto rounded-card bg-white p-6 shadow-modal max-sm:h-full max-sm:max-h-screen max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:px-4 max-sm:py-5">
        {title ? <h2 className="mb-4 text-lg font-bold text-navy">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2.5">{children}</div>;
}

export function LockNotice() {
  return (
    <div className="card px-6 py-14 text-center">
      <div className="mb-3.5 text-[42px]">🔒</div>
      <h2 className="mb-2 text-xl font-bold">這個功能暫時鎖定</h2>
      <p className="text-sm text-muted">接案商業功能目前暫停使用，資料不會讀取或異動</p>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-hint">
        {children}
      </td>
    </tr>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">{children}</div>;
}

export function DetailRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export function CalcRow({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return (
    <div
      className={`flex justify-between py-1 ${total ? "mt-1.5 border-t-2 border-line pt-2.5 text-lg font-bold" : "text-sm"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-[9px] sm:min-w-[280px] sm:max-w-md">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[15px] shrink-0 text-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        className="w-full border-0 bg-transparent text-[13.5px] outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ── 接案商業狀態徽章 ─────────────────────────────────────────

const PAYMENT_BADGE: Record<string, string> = {
  未付款: "badge-muted",
  已付訂金: "badge-gold",
  部分付款: "badge-blue",
  已付款: "badge-teal",
  已取消: "badge-danger",
};

export function PaymentBadge({ status }: { status: string }) {
  return <span className={`badge ${PAYMENT_BADGE[status] ?? PAYMENT_BADGE["未付款"]}`}>{status || "未付款"}</span>;
}

// 已讀追蹤：對應 Ragic「已讀時間」，只代表客戶是否/何時開啟過公開連結，不代表已簽署。
export function ReadBadge({ readAt }: { readAt: string }) {
  if (!readAt) return <span className="badge badge-muted">未讀</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="badge badge-teal self-start">已讀</span>
      <span className="text-[10.5px] text-muted">{readAt}</span>
    </div>
  );
}

// 線上簽署狀態：對應 Ragic「簽署人／簽署時間」（我們自訂簽署頁完成的簽名）。
export function OnlineSignBadge({ signerName, signedAt }: { signerName: string; signedAt: string }) {
  if (!signedAt) return <span className="badge badge-muted">尚未簽署</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="badge badge-teal self-start">{signerName ? `${signerName} 已簽署` : "已簽署"}</span>
      <span className="text-[10.5px] text-muted">{signedAt}</span>
    </div>
  );
}
