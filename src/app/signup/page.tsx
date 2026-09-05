import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-chrome";
import { getSessionUser } from "@/lib/auth";
import { SITE_URL } from "@/app/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a free account",
  description:
    "Create a free TenPoint account and build your own habit tracker with custom point values, a daily rating out of 10, a full calendar and Pomodoro timer.",
  alternates: { canonical: "/signup" },
  openGraph: { url: `${SITE_URL}/signup`, title: "Create a free account · TenPoint" },
};

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl place-items-center px-4 py-14 sm:px-6 md:py-20">
        <AuthForm mode="signup" />
      </main>
    </>
  );
}
