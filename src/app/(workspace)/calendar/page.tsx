import type { Metadata } from "next";
import { CalendarView } from "./calendar-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Plan habits, tasks, events and focus blocks on a month, week or day calendar.",
  robots: { index: false, follow: false },
};

export default function CalendarPage() {
  return <CalendarView />;
}
