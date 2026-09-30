import type { Metadata } from "next";
import { PublicHeader } from "@/components/public/PublicHeader";
import { BookingList } from "./BookingList";

export const metadata: Metadata = { title: { absolute: "預約時間 - 生活記事" } };

// 開放預約頁：免登入，對方可以選時段＋填姓名送出預約
export default function BookPage() {
  return (
    <>
      <PublicHeader title="預約 WD 的時間" subtitle="選一個時段，填上你的名字送出" />
      <main className="mx-auto max-w-[480px] px-4 pt-4 pb-10">
        <BookingList />
      </main>
    </>
  );
}
