import type { Metadata } from "next";
import { SeoPageShell, seoMetadata } from "@/components/seo-page";

export const metadata: Metadata = seoMetadata("pomodoro-timer") ?? { title: "Pomodoro timer" };

export default function Page() {
  return <SeoPageShell slug="pomodoro-timer" />;
}
