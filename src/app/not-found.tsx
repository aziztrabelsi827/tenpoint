import Link from "next/link";
import { SiteHeader } from "@/components/site-chrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-3xl place-items-center px-4 py-24 text-center sm:px-6">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">That page isn&apos;t on the scorecard</h1>
        <p className="mt-3 max-w-md text-sm" style={{ color: "var(--fg-muted)" }}>
          The page you were looking for doesn&apos;t exist. Try the dashboard, or one of the guides below.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">
            Open dashboard
          </Link>
          <Link href="/" className="btn">
            Back home
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {[
            { href: "/habit-tracker", label: "Habit tracker" },
            { href: "/daily-planner", label: "Daily planner" },
            { href: "/pomodoro-timer", label: "Pomodoro timer" },
            { href: "/habit-tracker-template", label: "Template" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="chip">
              {l.label}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
