import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { DM_Sans } from "next/font/google";
import { Space_Grotesk } from "next/font/google";
import { Newsreader } from "next/font/google";
import { Source_Serif_4 } from "next/font/google";
import { IBM_Plex_Sans } from "next/font/google";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const sourceSerif4 = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-4", display: "swap" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ibm-plex-sans", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ibm-plex-mono", display: "swap" });

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tenpoint.vercel.app";
export const SITE_NAME = "TenPoint";
export const SITE_TAGLINE = "Daily habit tracker, planner & productivity dashboard";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Daily Habit Tracker, Productivity Dashboard & Pomodoro Timer`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Rate every day out of 10. Positive habits and measurable tasks add to the rating, negative habits subtract from it, and each carries its own weight, target and fixed reward.",
  applicationName: SITE_NAME,
  keywords: [
    "rate my day",
    "daily rating tracker",
    "habit tracker",
    "daily habit tracker",
    "habit tracking app",
    "productivity tracker",
    "daily planner",
    "habit calendar",
    "habit progress tracker",
    "pomodoro timer",
    "daily productivity tracker",
    "positive and negative habits",
  ],
  authors: [{ name: `${SITE_NAME} Team`, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "productivity",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — Daily Habit Tracker & Productivity Dashboard`,
    description:
      "Rate my day: positive habits, negative habits, custom weights and repetition targets, all scored out of 10. Track, rate and analyse your consistency.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Daily Habit Tracker & Productivity Dashboard`,
    description:
      "A daily rating app that scores every day out of 10 using weighted positive habits, negative penalties and repetition targets.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1015" },
  ],
};

const themeBoot = `(function(){try{
var raw=localStorage.getItem('tenpoint.theme');
if(!raw)return;
var t=JSON.parse(raw);
var el=document.documentElement;
if(t&&t.theme){el.setAttribute('data-theme',t.theme);}
if(t&&t.theme==='custom'&&t.custom){
var c=t.custom;
el.style.setProperty('--primary',c.primary);
el.style.setProperty('--accent',c.accent);
el.style.setProperty('--bg',c.background);
el.style.setProperty('--bg-subtle',c.mode==='dark'?'#12161d':c.background);
el.style.setProperty('--card',c.card);
el.style.setProperty('--card-alt',c.mode==='dark'?'#1b212b':c.card);
el.style.setProperty('--line',c.mode==='dark'?'#242c38':'#e2e5ea');
el.style.setProperty('--line-strong',c.mode==='dark'?'#343e4d':'#c8ccd4');
el.style.setProperty('--fg',c.mode==='dark'?'#e8ecf3':'#16191f');
el.style.setProperty('--fg-muted',c.mode==='dark'?'#9aa5b6':'#5b6270');
el.style.setProperty('--fg-subtle',c.mode==='dark'?'#6b7686':'#8c94a3');
el.style.setProperty('--radius',Math.max(0,Math.min(28,c.radius))+'px');
el.style.setProperty('--radius-sm',Math.max(0,Math.min(20,Math.round(c.radius*0.65)))+'px');
}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description:
      "Daily rating app that scores every day out of 10 using weighted habits, measurable tasks and negative penalties.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Rate every day out of 10",
      "Positive habits and negative habits",
      "Measurable tasks with fixed rewards",
      "Custom weights and repetition targets",
      "Partial credit for habits and tasks",
      "Habit heatmap and streak analytics",
      "Daily planner and habit calendar",
      "Pomodoro focus timer",
      "Nine customisable themes",
    ],
  };
  return (
    <html
      lang="en"
      data-theme="productivity"
      suppressHydrationWarning
      className={`${inter.variable} ${dmSans.variable} ${spaceGrotesk.variable} ${newsreader.variable} ${sourceSerif4.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
