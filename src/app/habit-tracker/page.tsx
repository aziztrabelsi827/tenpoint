import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("habit-tracker") ?? { title: "Habit tracker" };

export default function Page() {
  return <SeoPageShell slug="habit-tracker" />;
}
