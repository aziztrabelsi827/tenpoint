import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("habit-calendar") ?? { title: "Habit calendar" };

export default function Page() {
  return <SeoPageShell slug="habit-calendar" />;
}
