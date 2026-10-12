import type { Metadata } from "next";
import { PlanView } from "./PlanView";

export const metadata: Metadata = { title: "預排班" };

export default function PlanPage() {
  return <PlanView />;
}
