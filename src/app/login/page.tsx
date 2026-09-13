import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-chrome";
import { getSessionUser } from "@/lib/auth";
import { SITE_URL } from "@/app/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your TenPoint habit tracker, daily planner and productivity dashboard.",
  alternates: { canonical: "/login" },
  openGraph: {
    url: `${SITE_URL}/login`,
    title: "Log in · TenPoint",
    siteName: "TenPoint",
    locale: "en_US",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "TenPoint — daily habit tracker, planner & productivity dashboard" }],
  },
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl place-items-center px-4 py-14 sm:px-6 md:py-20">
        <AuthForm mode="login" />
        <p className="mt-6 text-xs" style={{ color: "var(--fg-subtle)" }}>
          Read more about how the score works on the{" "}
          <Link href="/habit-tracker" className="hover:underline">habit tracker</Link> page.
        </p>
      </main>
    </>
  );
}
