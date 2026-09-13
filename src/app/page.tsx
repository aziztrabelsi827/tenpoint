import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SITE_URL } from "@/app/layout";

export const metadata: Metadata = {
  title: "TenPoint — Daily Habit Tracker, Productivity Dashboard & Pomodoro Timer",
  description:
    "Rate your day out of 10. Positive habits add to the rating, negative habits subtract from it, and each habit has its own weight and daily repetition target. Includes a full calendar and Pomodoro timer.",
  alternates: { canonical: "/" },
};

const HABIT_ROWS = [
  { name: "Exercise", icon: "🏃", days: [1, 1, 0, 1, 1, 0, 1], color: "#ef4444" },
  { name: "Reading", icon: "📖", days: [1, 0, 1, 1, 1, 1, 0], color: "#8b5cf6" },
  { name: "Meditation", icon: "🧘", days: [1, 1, 1, 0, 1, 0, 1], color: "#0ea5a4" },
  { name: "Study", icon: "🎓", days: [1, 1, 0, 1, 1, 1, 0], color: "#2563eb" },
  { name: "Water", icon: "💧", days: [1, 1, 1, 1, 0, 1, 1], color: "#0284c7" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const FEATURES = [
  {
    icon: "◱",
    title: "Today's rating, front and centre",
    text: "A large 0–10 gauge with the verdict, then a per-habit breakdown of exactly what earned and what cost you.",
    href: "/daily-habit-tracker",
    link: "See the daily tracker",
  },
  {
    icon: "▦",
    title: "Spreadsheet-grade habit grid",
    text: "Habits as rows with their weights and repetition counts, Monday to Sunday as columns. Click a cell to advance its occurrences.",
    href: "/habit-tracker",
    link: "How the grid works",
  },
  {
    icon: "🔥",
    title: "Streaks, heatmaps & per-habit analytics",
    text: "Every habit gets its own page with current streak, longest streak, completion rate, best month and a 52-week heatmap.",
    href: "/habit-tracker",
    link: "Explore the analytics",
  },
  {
    icon: "🗒",
    title: "Measurable tasks with fixed rewards",
    text: "Time, quantity, count or completion targets. Progress earns part of a fixed reward — 1 hour of a 2-hour study task worth 1 point earns +0.5.",
    href: "/daily-planner",
    link: "See the planner",
  },
  {
    icon: "🗓",
    title: "A real calendar, not a widget",
    text: "A full-page day, week and month calendar with an hour-by-hour time grid, a current-time indicator, and events you can drag and resize.",
    href: "/habit-calendar",
    link: "See the calendar",
  },
  {
    icon: "◔",
    title: "Pomodoro timer that logs focus",
    text: "Focus, short break and long break modes, fully customisable, with each session attachable to a habit or task.",
    href: "/pomodoro-timer",
    link: "See the timer",
  },
];

const THEMES = [
  { name: "Soft Minimal", tag: "Cream & pastel", colors: ["#f7f3ec", "#986145", "#8fae8b"] },
  { name: "Productivity", tag: "Spreadsheet crisp", colors: ["#f4f5f7", "#2563eb", "#0ea5a4"] },
  { name: "Dark", tag: "High contrast", colors: ["#0d1015", "#5b8def", "#22c8b0"] },
  { name: "Nature", tag: "Muted greens", colors: ["#eef1e6", "#497646", "#b7854f"] },
  { name: "Brutalist", tag: "Bold borders", colors: ["#fdfdfb", "#cc3e16", "#1a1aff"] },
  { name: "Custom", tag: "Your own tokens", colors: ["#f6f7f9", "#4f46e5", "#06b6d4"] },
];

const FAQ = [
  {
    q: "How does the daily score work?",
    a: "The rating is always out of 10. Positive habits contribute up to their weight once you hit their repetition target, measurable tasks contribute up to their fixed reward as you make progress, and negative habits subtract a penalty per occurrence. The result is clamped between 0 and 10, so it never becomes an ever-growing lifetime counter.",
  },
  {
    q: "Is TenPoint free?",
    a: "Yes. Creating an account is free and loads a fully editable starter set of seven habits, so you can begin scoring immediately.",
  },
  {
    q: "Can I change the look of the app?",
    a: "There are six themes — Soft Minimal, Productivity, Dark, Nature, Brutalist and a fully custom builder where you set primary, accent, background and card colours, border radius and light or dark mode.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. The layout is fully responsive: a sidebar on desktop and a bottom navigation bar on phones, with the habit grid scrolling horizontally on small screens.",
  },
];

export default function Home() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TenPoint",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <>
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />

      <main>
        {/* Hero */}
        <section
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--primary) 8%, var(--bg)) 0%, var(--bg) 100%)",
          }}
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="eyebrow">Track → Complete → Earn points → Analyse → Improve</p>
              <h1 className="mt-2 text-4xl font-bold leading-[1.05] md:text-6xl">
                Rate my day.
                <br />
                Out of ten.
                <br />
                <span style={{ color: "var(--primary)" }}>Every single day.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed md:text-lg" style={{ color: "var(--fg-muted)" }}>
                TenPoint scores your day out of 10. Positive habits such as prayer, study or exercise add to
                the rating; negative habits such as phone overuse subtract from it. Habits can repeat several
                times a day, so five prayers or three workouts stay one habit — with partial credit for each
                occurrence you complete.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/dashboard" className="btn btn-primary">
                  Open the dashboard
                </Link>
                <Link href="/habit-tracker" className="btn">
                  See how the score works
                </Link>
              </div>
              <dl className="mt-8 grid grid-cols-3 gap-4">
                {[
                  { k: "0–10", v: "daily rating, always" },
                  { k: "＋−", v: "positive & negative" },
                  { k: "1–20×", v: "repetitions per day" },
                ].map((s) => (
                  <div key={s.v}>
                    <dt className="num text-2xl font-bold" style={{ color: "var(--primary)" }}>
                      {s.k}
                    </dt>
                    <dd className="text-xs" style={{ color: "var(--fg-muted)" }}>
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Preview card */}
            <div className="card p-4 sm:p-5" aria-label="Product preview">
              <div className="flex items-center justify-between gap-3 pb-3">
                <div>
                  <p className="eyebrow">Today&apos;s progress</p>
                  <p className="num text-3xl font-bold">
                    7<span style={{ color: "var(--fg-subtle)" }}>/10</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="eyebrow">Streak</p>
                  <p className="num text-xl font-bold">🔥 12 days</p>
                </div>
              </div>
              <div
                className="mb-4 h-2.5 w-full overflow-hidden"
                style={{ background: "var(--bg-subtle)", borderRadius: 999 }}
              >
                <div className="progress-fill h-full" style={{ width: "70%", background: "var(--primary)", borderRadius: 999 }} />
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="grid-table min-w-[420px]">
                  <caption className="sr-only">Example habit completion grid</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left">Habit</th>
                      {DAY_LABELS.map((d, i) => (
                        <th key={i} scope="col" className="text-center">{d}</th>
                      ))}
                      <th scope="col" className="text-center">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HABIT_ROWS.map((row) => (
                      <tr key={row.name}>
                        <td>
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <span aria-hidden>{row.icon}</span>
                            {row.name}
                          </span>
                        </td>
                        {row.days.map((d, i) => (
                          <td key={i} className="text-center">
                            <span
                              className="mx-auto grid place-items-center"
                              aria-hidden
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "var(--radius-sm)",
                                border: `1px solid ${d ? row.color : "var(--line-strong)"}`,
                                background: d ? row.color : "transparent",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {d ? "✓" : ""}
                            </span>
                          </td>
                        ))}
                        <td className="num text-center text-sm font-bold">
                          {row.days.reduce((a, b) => a + b, 0)}/7
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pt-3 text-center text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                Click any cell — the score, streak and charts update instantly.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="features">
          <h2 id="features" className="max-w-2xl text-3xl font-bold md:text-4xl">
            A spreadsheet you&apos;ll actually open every day
          </h2>
          <p className="mt-3 max-w-2xl text-base" style={{ color: "var(--fg-muted)" }}>
            Structured enough to scan in two seconds, visual enough to make you want to keep the streak alive.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card flex flex-col p-5 transition-transform hover:-translate-y-0.5">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center text-lg"
                  style={{ background: "color-mix(in srgb, var(--primary) 12%, var(--card))", borderRadius: "var(--radius-sm)" }}
                >
                  {f.icon}
                </span>
                <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {f.text}
                </p>
                <Link href={f.href} className="mt-3 text-sm font-semibold hover:underline" style={{ color: "var(--primary)" }}>
                  {f.link} →
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6" aria-labelledby="how">
          <h2 id="how" className="text-3xl font-bold md:text-4xl">
            How the 0–10 rating works
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {[
              { n: "01", t: "Add positive habits", d: "Give each a weight — 2 points for prayer, 1 for reading — totalling 10." },
              { n: "02", t: "Add negative habits", d: "Phone overuse at −0.5, junk food at −1. Each occurrence costs you." },
              { n: "03", t: "Set repetition targets", d: "Five prayers, three workouts. Each occurrence earns partial credit." },
              { n: "04", t: "Measure your tasks", d: "2 hours of study, 30 pages, 100 push-ups. Progress earns a fixed reward." },
              { n: "05", t: "Rate the day", d: "Habits + tasks − penalties, clamped to 0–10. Never a lifetime counter." },
              { n: "06", t: "Improve", d: "See exactly what would have moved today up a point." },
            ].map((s) => (
              <li key={s.n} className="card p-5">
                <span className="num text-xs font-bold" style={{ color: "var(--primary)" }}>
                  {s.n}
                </span>
                <h3 className="mt-1.5 text-base font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {s.d}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Themes */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="themes">
          <h2 id="themes" className="text-3xl font-bold md:text-4xl">
            Six themes, one set of design tokens
          </h2>
          <p className="mt-3 max-w-2xl text-base" style={{ color: "var(--fg-muted)" }}>
            Every colour, radius and shadow is a CSS variable, so switching themes restyles the entire app
            instantly — no reload, no half-applied palette.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {THEMES.map((t) => (
              <article key={t.name} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{t.name}</h3>
                  <span className="chip">{t.tag}</span>
                </div>
                <div
                  className="mt-3 flex gap-1.5 p-2.5"
                  style={{ background: t.colors[0], borderRadius: "var(--radius-sm)", border: "1px solid var(--line)" }}
                >
                  {t.colors.map((c, i) => (
                    <span key={i} style={{ background: c, height: 28, flex: i === 0 ? 3 : 1, borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq">
          <h2 id="faq" className="text-3xl font-bold md:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card p-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none text-[15px] font-semibold">{f.q}</summary>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div
            className="card flex flex-wrap items-center justify-between gap-6 p-8"
            style={{ background: "color-mix(in srgb, var(--primary) 8%, var(--card))" }}
          >
            <div>
              <h2 className="text-2xl font-bold md:text-3xl">Start your first streak today</h2>
              <p className="mt-2 max-w-xl text-sm md:text-base" style={{ color: "var(--fg-muted)" }}>
                Free to create, add your own habits and tasks with custom point values, and get your first daily rating out of 10 in about ten seconds.
              </p>
            </div>
            <Link href="/dashboard" className="btn btn-primary">
              Open the dashboard
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
