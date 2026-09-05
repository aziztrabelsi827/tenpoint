import type { Metadata } from "next";
import { StatsView } from "./stats-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Progress",
  description: "Daily rating analytics: averages, best and lowest days, streaks, habit consistency and trends.",
  robots: { index: false, follow: false },
};

export default function StatsPage() {
  return <StatsView />;
}
