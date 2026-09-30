import type { Metadata } from "next";
import { ProjectsView } from "./ProjectsView";

export const metadata: Metadata = { title: "專案進度" };

export default function ProjectsPage() {
  return <ProjectsView />;
}
