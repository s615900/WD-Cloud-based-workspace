import type { Metadata } from "next";
import { HomeView } from "./HomeView";

export const metadata: Metadata = { title: "首頁" };

export default function DesktopHomePage() {
  return <HomeView />;
}
