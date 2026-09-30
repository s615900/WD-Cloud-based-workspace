import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "個人工作台",
    template: "%s - 個人工作台",
  },
  // 網站圖示用 app/favicon.ico、app/icon.png、app/apple-icon.png（Next.js 檔案慣例自動產生 <link>）
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0B3D5C",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
