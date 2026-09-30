import type { Metadata } from "next";
import { TasksView } from "./TasksView";

export const metadata: Metadata = { title: "待辦事項" };

export default function TasksPage() {
  return <TasksView />;
}
