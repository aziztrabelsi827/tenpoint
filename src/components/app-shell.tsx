"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { useWorkspace } from "@/components/workspace";
import { weekdayOf } from "@/lib/dates";
import { formatRating } from "@/lib/format";
import { scoreDay } from "@/lib/stats";

/**
 * The Calendar route needs the full viewport for its time grid, so it opts out
 * of the constrained content width other pages use.
 */
function CalendarRouteSpacer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const isCalendar = pathname === "/calendar" || pathname.startsWith("/calendar/");
  if (isCalendar) {
    return <div className="w-full px-3 pb-24 pt-3 sm:px-4 lg:pb-4 lg:pl-6 lg:pt-4">{children}</div>;
  }
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
      {children}
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="TenPoint home">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center text-[13px] font-black"
        style={{
          background: "var(--primary)",
          color: "var(--primary-fg)",
          borderRadius: "calc(var(--radius) * 0.55)",
        }}
      >
        10
      </span>
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold" style={{ letterSpacing: "var(--tracking)" }}>
            TenPoint
          </span>
          <span className="block text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            Habit workspace
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({
  children,
  userName,
  userEmail,
}: {
  children: ReactNode;
  userName: string;
  userEmail?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const { habits, logs, tasks, taskProgress } = useWorkspace();
  const [mobileMore, setMobileMore] = useState(false);

  const { today } = useWorkspace();
  const rating = scoreDay(
    { habits, habitLogs: logs, tasks, taskProgress, today },
    today,
    weekdayOf,
  ).rating;
  const openTasks = tasks.filter((t) => t.status !== "completed" && t.day === today).length;

  const primary = NAV_ITEMS.slice(0, 5);
  const secondary = NAV_ITEMS.slice(5);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-black focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="fixed left-0 top-0 z-40 hidden h-screen w-[248px] flex-col border-r lg:flex"
        style={{ background: "var(--card)", borderColor: "var(--line)" }}
      >
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Main navigation" className="flex-1 px-3">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="flex items-center gap-3 px-3 py-2 text-sm font-semibold transition-colors"
                    style={{
                      borderRadius: "var(--radius-sm)",
                      background: active ? "var(--bg-subtle)" : "transparent",
                      color: active ? "var(--fg)" : "var(--fg-muted)",
                      borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
                    }}
                  >
                    <span aria-hidden className="w-4 text-center text-base">
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/dashboard" ? (
                      <span
                        className="num text-[11px] font-bold"
                        style={{ color: rating >= 9.95 ? "var(--positive)" : "var(--fg-subtle)" }}
                      >
                        {formatRating(rating)}/10
                      </span>
                    ) : null}
                    {item.href === "/tasks" && openTasks > 0 ? (
                      <span
                        className="num grid h-5 min-w-5 place-items-center px-1 text-[11px] font-bold"
                        style={{ background: "var(--primary)", color: "var(--primary-fg)", borderRadius: 999 }}
                      >
                        {openTasks}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t px-2 py-2" style={{ borderColor: "var(--line)" }}>
          <div className="mb-1 flex items-center gap-3 px-3 py-2">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold uppercase"
              style={{ background: "var(--bg-subtle)", color: "var(--primary)" }}
            >
              {(userName || userEmail || "?").trim().charAt(0)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{userName || "Account"}</span>
              {userEmail ? (
                <span className="truncate text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                  {userEmail}
                </span>
              ) : null}
            </span>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 text-sm font-semibold transition-colors"
            style={{ borderRadius: "var(--radius-sm)", color: "var(--fg-muted)" }}
          >
            <span aria-hidden className="w-4 text-center text-base">
              ⚙
            </span>
            <span className="flex-1">Settings</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
            style={{ borderRadius: "var(--radius-sm)", color: "var(--danger)" }}
          >
            <span aria-hidden className="w-4 text-center text-base">
              ⇥
            </span>
            <span className="flex-1">{signingOut ? "Signing out…" : "Logout"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b px-4 py-3 lg:hidden"
        style={{ background: "var(--card)", borderColor: "var(--line)" }}
      >
        <Logo />
        <div className="flex items-center gap-2">
          <span className="chip num">
            <span style={{ color: "var(--primary)" }}>●</span>
            {formatRating(rating)}/10 today
          </span>
          <Link href="/settings" className="btn btn-sm" aria-label="Open settings">
            ⚙
          </Link>
        </div>
      </header>

      {/* Mobile "more" sheet */}
      {mobileMore ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="animate-fade-in absolute inset-0" style={{ background: "rgba(9,11,16,0.5)" }} onClick={() => setMobileMore(false)} />
          <div
            className="animate-slide-up absolute bottom-0 left-0 right-0 p-4"
            style={{ background: "var(--card)", borderTop: "1px solid var(--line)", borderRadius: "var(--radius) var(--radius) 0 0" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">More</p>
              <button type="button" className="btn btn-sm" onClick={() => setMobileMore(false)}>
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMore(false)}
                  className="surface flex items-center gap-2 px-3 py-2.5 text-sm font-semibold"
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              <Link href="/settings" className="surface flex items-center gap-2 px-3 py-2.5 text-sm font-semibold">
                <span aria-hidden>⚙</span> Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMore(false);
                  void signOut();
                }}
                disabled={signingOut}
                className="surface flex items-center gap-2 px-3 py-2.5 text-sm font-semibold"
                style={{ color: "var(--danger)" }}
              >
                <span aria-hidden>⇥</span>
                {signingOut ? "Signing out…" : "Logout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main id="main" className="lg:pl-[248px]">
        <CalendarRouteSpacer>{children}</CalendarRouteSpacer>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t lg:hidden"
        style={{ background: "var(--card)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[52px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold"
              style={{ color: active ? "var(--primary)" : "var(--fg-subtle)" }}
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMore(true)}
          className="flex min-h-[52px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span aria-hidden className="text-lg leading-none">
            ⋯
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
