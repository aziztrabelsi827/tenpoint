import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("productivity-tracker") ?? { title: "Productivity tracker" };

export default function Page() {
  return <SeoPageShell slug="productivity-tracker" />;
}
