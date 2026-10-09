// 診斷用：測試 iPhone「加入主畫面」後，不同狀態列樣式實際的表現（免登入、不含任何個人資料）。
// 三個網址：/pwa-test/black、/pwa-test/default、/pwa-test/translucent，各自加入主畫面比較。
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Probe } from "./Probe";

const STYLES = { black: "black", default: "default", translucent: "black-translucent" } as const;
type StyleKey = keyof typeof STYLES;

export function generateStaticParams() {
  return (Object.keys(STYLES) as StyleKey[]).map((style) => ({ style }));
}

export async function generateMetadata({ params }: PageProps<"/pwa-test/[style]">): Promise<Metadata> {
  const { style } = await params;
  if (!(style in STYLES)) return {};
  return {
    title: `測試-${style}`,
    // 每個測試頁用自己的 manifest，start_url 才會是這一頁（否則加入主畫面後會開到 /desktop）
    manifest: `/pwa-test/${style}/manifest.json`,
    appleWebApp: { capable: true, title: `測試-${style}`, statusBarStyle: STYLES[style as StyleKey] },
  };
}

export default async function PwaTestPage({ params }: PageProps<"/pwa-test/[style]">) {
  const { style } = await params;
  if (!(style in STYLES)) notFound();
  return <Probe style={style} meta={STYLES[style as StyleKey]} />;
}
