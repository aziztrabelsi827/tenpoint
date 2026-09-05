import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("daily-habit-tracker") ?? { title: "Daily habit tracker" };

export default function Page() {
  return <SeoPageShell slug="daily-habit-tracker" />;
}
