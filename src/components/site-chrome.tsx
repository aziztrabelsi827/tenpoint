import Link from "next/link";

const LINKS = [
  { href: "/habit-tracker", label: "Habit tracker" },
  { href: "/daily-habit-tracker", label: "Daily tracker" },
  { href: "/productivity-tracker", label: "Productivity" },
  { href: "/pomodoro-timer", label: "Pomodoro" },
  { href: "/daily-planner", label: "Daily planner" },
  { href: "/habit-calendar", label: "Calendar" },
  { href: "/habit-tracker-template", label: "Template" },
];

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--card) 88%, transparent)", borderColor: "var(--line)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="TenPoint home">
          <span
            className="grid h-8 w-8 place-items-center text-[12px] font-black"
            style={{ background: "var(--primary)", color: "var(--primary-fg)", borderRadius: "calc(var(--radius) * 0.5)" }}
          >
            10
          </span>
          <span className="text-[15px] font-bold">TenPoint</span>
        </Link>
        <nav aria-label="Product pages" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ color: "var(--fg-muted)" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn btn-sm btn-primary">
            Open the dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center text-[12px] font-black"
              style={{ background: "var(--primary)", color: "var(--primary-fg)", borderRadius: "calc(var(--radius) * 0.5)" }}
            >
              10
            </span>
            <span className="text-[15px] font-bold">TenPoint</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            A habit tracker, daily planner and productivity dashboard that scores your day out of ten points.
          </p>
        </div>
        <nav aria-label="Product">
          <h2 className="eyebrow mb-3">Product</h2>
          <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            {LINKS.slice(0, 4).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Guides">
          <h2 className="eyebrow mb-3">Guides</h2>
          <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            {LINKS.slice(4).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Workspace">
          <h2 className="eyebrow mb-3">Workspace</h2>
          <ul className="flex flex-col gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
            <li>
              <Link href="/dashboard" className="hover:underline">
                Open the dashboard
              </Link>
            </li>
            <li>
              <Link href="/habit-tracker-template" className="hover:underline">
                Starter template
              </Link>
            </li>
            <li>
              <Link href="/settings" className="hover:underline">
                Themes &amp; settings
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div
        className="border-t px-4 py-5 text-center text-xs sm:px-6"
        style={{ borderColor: "var(--line)", color: "var(--fg-subtle)" }}
      >
        © {new Date().getFullYear()} TenPoint. Track → Complete → Earn points → Analyse → Improve.
      </div>
    </footer>
  );
}
