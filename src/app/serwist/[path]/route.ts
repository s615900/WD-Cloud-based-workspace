// Service worker 的產生端：build 時把 src/app/sw.ts 打包成 /serwist/sw.js，並注入預快取清單。
// （Next 16 預設用 Turbopack，舊的 @serwist/next 需要 webpack，所以用 @serwist/turbopack）
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// 離線頁的版本標記：每次部署 commit 不同 → service worker 內容跟著變 → 手機會自動更新。
// 部署環境沒有 git 時改用隨機值（每次 build 都不同，同樣會更新）。
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
