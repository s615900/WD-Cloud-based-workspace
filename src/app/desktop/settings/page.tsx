import type { Metadata } from "next";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "設定" };

export default function SettingsPage() {
  return <SettingsView />;
}
