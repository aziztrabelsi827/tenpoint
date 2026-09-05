import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-chrome";
import { SITE_URL } from "@/app/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your TenPoint password. We'll email you a secure link to set a new one.",
  alternates: { canonical: "/forgot-password" },
  openGraph: { url: `${SITE_URL}/forgot-password`, title: "Forgot password · TenPoint" },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl place-items-center px-4 py-14 sm:px-6 md:py-20">
        <AuthForm mode="forgot-password" />
        <p className="mt-6 text-xs" style={{ color: "var(--fg-subtle)" }}>
          Remembered it?{" "}
          <Link href="/login" className="hover:underline">Go back to log in</Link>
        </p>
      </main>
    </>
  );
}
