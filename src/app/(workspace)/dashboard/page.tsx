import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { hourInZone } from "@/lib/timezone";
import { ensureSettings } from "@/lib/data";
import { greetingForHour } from "@/lib/dates";
import { DashboardView } from "./dashboard-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Rate your day out of 10 and work directly from one daily workspace.",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await requireUser();
  // ensureSettings is idempotent (upsert). requireUser already provisions, but
  // we need the returned settings DTO to compute the timezone-aware greeting.
  const settings = await ensureSettings(user.id);
  const now = new Date();
  const greeting = greetingForHour(hourInZone(now, settings.timezone));
  return <DashboardView userName={user.name} greeting={greeting} />;
}
