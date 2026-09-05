import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/layout";

const pages = [
  { path: "/", priority: 1, freq: "weekly" as const },
  { path: "/habit-tracker", priority: 0.9, freq: "weekly" as const },
  { path: "/daily-habit-tracker", priority: 0.9, freq: "weekly" as const },
  { path: "/productivity-tracker", priority: 0.85, freq: "weekly" as const },
  { path: "/pomodoro-timer", priority: 0.85, freq: "monthly" as const },
  { path: "/daily-planner", priority: 0.85, freq: "weekly" as const },
  { path: "/habit-calendar", priority: 0.8, freq: "monthly" as const },
  { path: "/habit-tracker-template", priority: 0.8, freq: "monthly" as const },
  { path: "/login", priority: 0.4, freq: "yearly" as const },
  { path: "/signup", priority: 0.6, freq: "monthly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return pages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified,
    changeFrequency: p.freq,
    priority: p.priority,
  }));
}
