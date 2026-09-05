import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("daily-planner") ?? { title: "Daily planner" };

export default function Page() {
  return <SeoPageShell slug="daily-planner" />;
}
