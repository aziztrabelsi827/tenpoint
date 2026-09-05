import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings & themes",
  description: "Change the visual theme, customise colours and radius, and tune your timer defaults.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser();
  return <SettingsView userName={user.name} />;
}
