import type { Metadata } from "next";
import { TasksView } from "./tasks-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Measurable tasks with time, quantity, count and completion targets, each earning a fixed reward toward the daily rating.",
  robots: { index: false, follow: false },
};

export default function TasksPage() {
  return <TasksView />;
}
