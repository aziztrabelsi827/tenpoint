import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/app/layout";
import { getSeoPage } from "@/content/seo";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export function SeoPageShell({ slug }: { slug: string }) {
  const page = getSeoPage(slug);
  if (!page) return null;

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: page.title, item: `${SITE_URL}/${page.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <SiteHeader />
      <main>
        <Hero page={page} />
        <Features page={page} />
        <Sections page={page} />
        <Faq page={page} />
        <Related page={page} />
      </main>
      <SiteFooter />
    </>
  );
}

type Page = NonNullable<ReturnType<typeof getSeoPage>>;

function Hero({ page }: { page: Page }) {
  return (
    <section
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--primary) 7%, var(--bg)) 0%, var(--bg) 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs" style={{ color: "var(--fg-subtle)" }}>
          <Link href="/" className="hover:underline">
            Home
          </Link>
          <span aria-hidden>/</span>
          <span style={{ color: "var(--fg)" }}>{page.title}</span>
        </nav>
        <p className="eyebrow">{page.eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-[1.1] md:text-5xl">{page.h1}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed md:text-lg" style={{ color: "var(--fg-muted)" }}>
          {page.intro}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn btn-primary">
            Open the dashboard
          </Link>
          <Link href="/habit-tracker" className="btn">
            How the score works
          </Link>
        </div>
      </div>
    </section>
  );
}

function Features({ page }: { page: Page }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6" aria-label="Features">
      <h2 className="text-2xl font-semibold md:text-3xl">What&apos;s included</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {page.features.map((f) => (
          <article key={f.title} className="card p-5">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center text-lg"
              style={{ background: "color-mix(in srgb, var(--primary) 12%, var(--card))", borderRadius: "var(--radius-sm)" }}
            >
              {f.icon}
            </span>
            <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              {f.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Sections({ page }: { page: Page }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
      {page.sections.map((s) => (
        <section key={s.heading} className="py-8">
          <h2 className="text-2xl font-semibold md:text-[1.7rem]">{s.heading}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="mt-3 text-[15px] leading-[1.75]" style={{ color: "var(--fg-muted)" }}>
              {p}
            </p>
          ))}
          {s.bullets ? (
            <ul className="mt-4 flex flex-col gap-2">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2.5 text-[15px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  <span aria-hidden style={{ color: "var(--primary)" }}>
                    ▸
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.table ? (
            <div className="card mt-5 overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="grid-table min-w-[560px]">
                  <caption className="sr-only">{s.heading}</caption>
                  <thead>
                    <tr>
                      {s.table.columns.map((c) => (
                        <th key={c} scope="col" className="text-left">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className={j === 0 ? "font-semibold" : "num"}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function Faq({ page }: { page: Page }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" aria-labelledby="faq">
      <h2 id="faq" className="text-2xl font-semibold md:text-[1.7rem]">
        Frequently asked questions
      </h2>
      <div className="mt-5 flex flex-col gap-3">
        {page.faq.map((f) => (
          <details key={f.q} className="card p-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-[15px] font-semibold">
              {f.q}
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Related({ page }: { page: Page }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6" aria-label="Related pages">
      <h2 className="text-xl font-semibold">Keep reading</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {page.related.map((r) => (
          <Link key={r.href} href={r.href} className="card p-4 transition-transform hover:-translate-y-0.5">
            <p className="text-sm font-semibold">{r.label}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
              {r.text}
            </p>
          </Link>
        ))}
      </div>
      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-xl font-semibold">Track → Complete → Earn points → Analyse → Improve</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            A 0–10 daily rating with positive and negative habits, six themes and a Pomodoro timer. Free to create.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-primary">
          Open the dashboard
        </Link>
      </div>
    </section>
  );
}

export function seoMetadata(slug: string): Metadata | null {
  const page = getSeoPage(slug);
  if (!page) return null;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: "article",
      url: `${SITE_URL}/${page.slug}`,
      title: page.metaTitle,
      description: page.metaDescription,
    },
    twitter: { card: "summary_large_image", title: page.metaTitle, description: page.metaDescription },
  };
}
