import type { Metadata } from "next";
import { HabitDetailView } from "./habit-detail-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const label = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return {
    title: `${label} — habit analytics`,
    description: `Streaks, completion rate, heatmaps and monthly history for your ${label.toLowerCase()} habit.`,
    robots: { index: false, follow: false },
  };
}

export default async function HabitDetailPage({ params }: Params) {
  const { slug } = await params;
  return <HabitDetailView slug={slug} />;
}
