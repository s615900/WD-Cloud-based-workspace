import type { Metadata } from "next";
import { HrView } from "./HrView";

export const metadata: Metadata = { title: "人事假勤" };

export default function HrPage() {
  return <HrView />;
}
