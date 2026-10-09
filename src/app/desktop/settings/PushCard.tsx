"use client";

import { useCallback, useEffect, useState } from "react";
import { Message, type MessageState } from "@/components/ui";
import { apiFetch, errorText, sendJson } from "@/lib/client";

// iOS 規定：網頁推播只有「已加入主畫面、從主畫面圖示開啟」的 App 才能用，
// 而且一定要由使用者點擊按鈕才能請求通知權限（不能在頁面載入時自動跳出）。
type Mode = "checking" | "ios-install" | "unsupported" | "denied" | "off" | "on";

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ 的 Safari 會假裝成 Mac，用觸控點數判斷
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "未知裝置";
}

// VAPID 公鑰是 base64url 字串，PushManager.subscribe 要的是 Uint8Array
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export function PushCard() {
  const [mode, setMode] = useState<Mode>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageState>({ text: "" });

  const refresh = useCallback(async () => {
    if (isIOS() && !isStandalone()) return setMode("ios-install");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setMode("unsupported");
    if (Notification.permission === "denied") return setMode("denied");
    try {
      setMode((await currentSubscription()) && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setMode("unsupported");
    }
  }, []);

  useEffect(() => {
    // 判斷環境要用 window／navigator，只能在載入後的瀏覽器端執行
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage({ text: "" });
    try {
      // requestPermission 必須是點擊後的第一個動作，中間不能先 await 別的東西，否則 iOS 會視為非使用者操作
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage({ text: "沒有取得通知權限", kind: "error" });
        return;
      }
      const { publicKey } = await apiFetch<{ publicKey: string }>("/api/push/public-key");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await sendJson("/api/push/subscribe", "POST", { ...sub.toJSON(), deviceName: deviceName() });
      setMessage({ text: "已開啟通知", kind: "success" });
    } catch (err) {
      setMessage({ text: errorText(err, "開啟失敗"), kind: "error" });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function disable() {
    setBusy(true);
    setMessage({ text: "" });
    try {
      const sub = await currentSubscription();
      if (sub) {
        await sendJson("/api/push/unsubscribe", "POST", { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setMessage({ text: "已關閉通知", kind: "success" });
    } catch (err) {
      setMessage({ text: errorText(err, "關閉失敗"), kind: "error" });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage({ text: "傳送中…" });
    try {
      await sendJson("/api/push/test", "POST", {});
      setMessage({ text: "已送出，幾秒內會收到通知", kind: "success" });
    } catch (err) {
      setMessage({ text: errorText(err, "傳送失敗"), kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-5">
      <h3>推播通知</h3>
      {mode === "checking" && <p className="empty-hint">檢查中…</p>}

      {mode === "ios-install" && (
        <div className="text-sm leading-relaxed">
          <p className="mb-2">iPhone 必須先把這個網站加入主畫面，才能開啟通知：</p>
          <ol className="ml-5 list-decimal space-y-1 text-muted">
            <li>用 Safari 打開本網站</li>
            <li>點下方的「分享」按鈕（方框加向上箭頭）</li>
            <li>選「加入主畫面」，按「加入」</li>
            <li>回到主畫面，從「生活記事」圖示開啟，再到這個設定頁按「開啟通知」</li>
          </ol>
          <p className="mt-2 text-muted">需要 iOS 16.4 以上。</p>
        </div>
      )}

      {mode === "unsupported" && <p className="empty-hint">這個瀏覽器不支援推播通知（iPhone 需要 iOS 16.4 以上）。</p>}

      {mode === "denied" && (
        <p className="text-sm leading-relaxed text-muted">
          通知權限已被拒絕。請到 iPhone「設定」→「通知」→「生活記事」重新開啟；電腦瀏覽器則是網址列旁的網站設定。
        </p>
      )}

      {mode === "off" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">待辦到期時，會推播通知到這台裝置。</span>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={enable}>
            開啟通知
          </button>
        </div>
      )}

      {mode === "on" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="badge badge-teal">已開啟</span> 這台裝置會收到推播
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={sendTest}>
              傳送測試通知
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={disable}>
              關閉通知
            </button>
          </span>
        </div>
      )}

      <Message state={message} />
    </div>
  );
}
