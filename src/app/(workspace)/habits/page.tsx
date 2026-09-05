import type { Metadata } from "next";
import { HabitsView } from "./habits-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Habits",
  description: "Create, rename, reorder, colour and schedule as many daily habits as you need, each with its own weight and repetition target.",
  robots: { index: false, follow: false },
};

export default function HabitsPage() {
  return <HabitsView />;
}
