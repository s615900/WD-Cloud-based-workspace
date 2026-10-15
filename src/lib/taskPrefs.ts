"use client";

import { useSyncExternalStore } from "react";

// 「待辦事項」頁的顯示偏好，存在這個瀏覽器（localStorage），不同裝置各自設定。
// hideDone：已完成的事項不出現在「全部」清單，只有狀態篩選選「完成」時才顯示（預設開啟）。
const KEY = "wd-tasks-hide-done";
const EVENT = "wd-tasks-prefs";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setHideDone(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // 無痕模式等情況存不了就算了，這次操作照常生效
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useHideDone(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
