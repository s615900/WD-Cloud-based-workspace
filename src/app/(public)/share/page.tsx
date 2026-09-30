import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ShareList } from "./ShareList";

export const metadata: Metadata = { title: { absolute: "空檔時間分享 - 生活記事" } };

// 分享空檔頁：純唯讀、免登入，只顯示空檔時段（不含行程／待辦的實際內容）
export default function SharePage() {
  return (
    <>
      <PublicHeader title="WD 的空檔時間" subtitle="即時更新" />
      <main className="mx-auto max-w-[480px] px-4 pt-4 pb-10">
        <ShareList />
      </main>
    </>
  );
}
