import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("habit-tracker-template") ?? { title: "Habit tracker template" };

export default function Page() {
  return <SeoPageShell slug="habit-tracker-template" />;
}
