import type { Metadata } from "next";
import { TimerView } from "./timer-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Focus timer",
  description: "A customisable Pomodoro timer that connects focus sessions to your tasks and habits.",
  robots: { index: false, follow: false },
};

export default function TimerPage() {
  return <TimerView />;
}
