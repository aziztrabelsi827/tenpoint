import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-chrome";
import { SITE_URL } from "@/app/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password for your TenPoint account.",
  alternates: { canonical: "/reset-password" },
  openGraph: { url: `${SITE_URL}/reset-password`, title: "Reset password · TenPoint" },
};

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl place-items-center px-4 py-14 sm:px-6 md:py-20">
        <AuthForm mode="reset-password" />
        <p className="mt-6 text-xs" style={{ color: "var(--fg-subtle)" }}>
          <Link href="/login" className="hover:underline">Back to log in</Link>
        </p>
      </main>
    </>
  );
}
