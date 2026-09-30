"use client";

// 接案商業四頁（客戶資料／報價單／合約／專案進度）＋首頁摘要卡片共用：查詢每個模組
// 各自是否鎖定（BUSINESS_MODULE_LOCKS）。整個瀏覽階段只打一次（快取 promise），失敗就當作
// 全部沒鎖定，不要因為這支設定 API 打不通就把整頁鎖死。
import { useEffect, useState } from "react";
import type { BusinessLocks } from "./types";

let locksPromise: Promise<BusinessLocks> | null = null;

export function getBusinessLocks(): Promise<BusinessLocks> {
  if (!locksPromise) {
    locksPromise = fetch("/api/desktop-settings")
      .then((res) => res.json())
      .then((data: { businessModuleLocks?: BusinessLocks }) => data?.businessModuleLocks ?? {})
      .catch(() => ({}));
  }
  return locksPromise;
}

// 回傳 null 代表還在查詢中
export function useBusinessLocks(): BusinessLocks | null {
  const [locks, setLocks] = useState<BusinessLocks | null>(null);
  useEffect(() => {
    let alive = true;
    getBusinessLocks().then((l) => alive && setLocks(l));
    return () => {
      alive = false;
    };
  }, []);
  return locks;
}
