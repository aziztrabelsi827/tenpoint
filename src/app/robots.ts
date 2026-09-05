import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/layout";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/habits/", "/tasks", "/calendar", "/timer", "/stats", "/settings"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
