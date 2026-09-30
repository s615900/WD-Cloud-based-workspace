import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "個人工作台",
    template: "%s - 個人工作台",
  },
  manifest: "/manifest.json",
  icons: { apple: "/icons/icon-180.png" },
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
