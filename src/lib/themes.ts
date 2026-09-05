export type ThemeId =
  | "soft"
  | "productivity"
  | "dark"
  | "nature"
  | "brutalist"
  | "custom";

export type ThemeTokens = {
  bg: string;
  bgSubtle: string;
  card: string;
  cardAlt: string;
  line: string;
  lineStrong: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  primary: string;
  primaryFg: string;
  accent: string;
  positive: string;
  warn: string;
  danger: string;
  radius: string;
  radiusSm: string;
  shadow: string;
  shadowSm: string;
  headingWeight: string;
  tracking: string;
  uppercase: string;
  gridLine: string;
};

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
  swatch: [string, string, string];
};

export const THEME_PRESETS: Record<Exclude<ThemeId, "custom">, ThemeTokens> = {
  soft: {
    bg: "#f7f3ec",
    bgSubtle: "#f1e9dd",
    card: "#fffdf9",
    cardAlt: "#faf4ea",
    line: "#e7dcc9",
    lineStrong: "#d6c6ab",
    fg: "#3f382e",
    fgMuted: "#7a6f5f",
    fgSubtle: "#a29682",
    primary: "#d98a63",
    primaryFg: "#ffffff",
    accent: "#8fae8b",
    positive: "#6f9e6b",
    warn: "#d9a53f",
    danger: "#c9705f",
    radius: "20px",
    radiusSm: "12px",
    shadow: "0 10px 30px -18px rgba(96, 78, 52, 0.35)",
    shadowSm: "0 4px 14px -10px rgba(96, 78, 52, 0.35)",
    headingWeight: "600",
    tracking: "-0.01em",
    uppercase: "none",
    gridLine: "#efe6d6",
  },
  productivity: {
    bg: "#f4f5f7",
    bgSubtle: "#eceef1",
    card: "#ffffff",
    cardAlt: "#f8f9fb",
    line: "#e2e5ea",
    lineStrong: "#c8ccd4",
    fg: "#16191f",
    fgMuted: "#5b6270",
    fgSubtle: "#8c94a3",
    primary: "#2563eb",
    primaryFg: "#ffffff",
    accent: "#0ea5a4",
    positive: "#16a34a",
    warn: "#d97706",
    danger: "#dc2626",
    radius: "12px",
    radiusSm: "8px",
    shadow: "0 12px 32px -20px rgba(15, 23, 42, 0.28)",
    shadowSm: "0 2px 8px -4px rgba(15, 23, 42, 0.18)",
    headingWeight: "650",
    tracking: "-0.015em",
    uppercase: "uppercase",
    gridLine: "#eef0f3",
  },
  dark: {
    bg: "#0d1015",
    bgSubtle: "#12161d",
    card: "#161b23",
    cardAlt: "#1b212b",
    line: "#242c38",
    lineStrong: "#343e4d",
    fg: "#e8ecf3",
    fgMuted: "#9aa5b6",
    fgSubtle: "#6b7686",
    primary: "#5b8def",
    primaryFg: "#0b0e13",
    accent: "#22c8b0",
    positive: "#34d399",
    warn: "#f0b429",
    danger: "#f87171",
    radius: "14px",
    radiusSm: "10px",
    shadow: "0 18px 40px -24px rgba(0, 0, 0, 0.85)",
    shadowSm: "0 4px 16px -10px rgba(0, 0, 0, 0.7)",
    headingWeight: "600",
    tracking: "-0.01em",
    uppercase: "none",
    gridLine: "#1e242e",
  },
  nature: {
    bg: "#eef1e6",
    bgSubtle: "#e4e9d8",
    card: "#fbfcf7",
    cardAlt: "#f2f5ea",
    line: "#d6ddc4",
    lineStrong: "#bdc9a3",
    fg: "#28331f",
    fgMuted: "#5d6b4c",
    fgSubtle: "#8b977a",
    primary: "#4d7c4a",
    primaryFg: "#ffffff",
    accent: "#b7854f",
    positive: "#4d7c4a",
    warn: "#c08a2e",
    danger: "#a9563f",
    radius: "18px",
    radiusSm: "11px",
    shadow: "0 10px 26px -18px rgba(41, 61, 32, 0.4)",
    shadowSm: "0 4px 12px -8px rgba(41, 61, 32, 0.3)",
    headingWeight: "600",
    tracking: "-0.005em",
    uppercase: "none",
    gridLine: "#e6ebd9",
  },
  brutalist: {
    bg: "#fdfdfb",
    bgSubtle: "#f0f0ec",
    card: "#ffffff",
    cardAlt: "#f7f7f3",
    line: "#101010",
    lineStrong: "#101010",
    fg: "#0a0a0a",
    fgMuted: "#4a4a4a",
    fgSubtle: "#787878",
    primary: "#ff4d1c",
    primaryFg: "#ffffff",
    accent: "#1a1aff",
    positive: "#0a8f3c",
    warn: "#e0a400",
    danger: "#d40000",
    radius: "0px",
    radiusSm: "0px",
    shadow: "6px 6px 0 0 #101010",
    shadowSm: "3px 3px 0 0 #101010",
    headingWeight: "800",
    tracking: "-0.02em",
    uppercase: "uppercase",
    gridLine: "#deded8",
  },
};

export const THEME_LIST: ThemeMeta[] = [
  {
    id: "soft",
    name: "Soft Minimal",
    tagline: "Cream & pastel",
    description:
      "Warm cream canvas, pastel cards and generous rounding. Calm, quiet and easy on the eyes for long daily use.",
    swatch: ["#f7f3ec", "#d98a63", "#8fae8b"],
  },
  {
    id: "productivity",
    name: "Productivity",
    tagline: "Spreadsheet crisp",
    description:
      "A clean white and gray workspace built for scanning dense grids fast. The default for spreadsheet people.",
    swatch: ["#f4f5f7", "#2563eb", "#0ea5a4"],
  },
  {
    id: "dark",
    name: "Dark",
    tagline: "High contrast",
    description:
      "A deep charcoal interface with a single restrained accent, tuned for evening reviews and low light.",
    swatch: ["#0d1015", "#5b8def", "#22c8b0"],
  },
  {
    id: "nature",
    name: "Nature",
    tagline: "Muted greens",
    description:
      "Soft sage greens with organic rounding for a slower, steadier pace of building habits.",
    swatch: ["#eef1e6", "#4d7c4a", "#b7854f"],
  },
  {
    id: "brutalist",
    name: "Brutalist",
    tagline: "Bold borders",
    description:
      "Heavy borders, hard shadows and confident typography. Structure you can feel.",
    swatch: ["#fdfdfb", "#ff4d1c", "#1a1aff"],
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "Your tokens",
    description:
      "Pick your own primary, accent, background and card colours, radius and light or dark mode.",
    swatch: ["#f6f7f9", "#2563eb", "#14b8a6"],
  },
];

export type CustomThemeInput = {
  primary: string;
  accent: string;
  background: string;
  card: string;
  radius: number;
  mode: "light" | "dark";
};

export function buildCustomTokens(input: CustomThemeInput): ThemeTokens {
  const dark = input.mode === "dark";
  const luminance = relativeLuminance(input.background);
  const fg = luminance > 0.45 ? "#14171c" : "#eef1f6";
  const fgMuted = luminance > 0.45 ? "#5b6270" : "#9aa5b6";
  const fgSubtle = luminance > 0.45 ? "#8c94a3" : "#6b7686";
  const line = luminance > 0.45 ? "#e2e5ea" : "#242c38";
  const lineStrong = luminance > 0.45 ? "#c8ccd4" : "#343e4d";
  const bgSubtle = luminance > 0.45 ? "#eceef1" : "#12161d";
  const cardAlt = luminance > 0.45 ? "#f8f9fb" : "#1b212b";
  const primaryFg = relativeLuminance(input.primary) > 0.55 ? "#101318" : "#ffffff";
  return {
    bg: input.background,
    bgSubtle,
    card: input.card,
    cardAlt,
    line,
    lineStrong,
    fg,
    fgMuted,
    fgSubtle,
    primary: input.primary,
    primaryFg,
    accent: input.accent,
    positive: dark ? "#34d399" : "#16a34a",
    warn: dark ? "#f0b429" : "#d97706",
    danger: dark ? "#f87171" : "#dc2626",
    radius: `${Math.max(0, Math.min(28, input.radius))}px`,
    radiusSm: `${Math.max(0, Math.min(20, Math.round(input.radius * 0.65)))}px`,
    shadow: dark
      ? "0 18px 40px -24px rgba(0,0,0,0.85)"
      : "0 12px 32px -20px rgba(15,23,42,0.28)",
    shadowSm: dark
      ? "0 4px 16px -10px rgba(0,0,0,0.7)"
      : "0 2px 8px -4px rgba(15,23,42,0.18)",
    headingWeight: "650",
    tracking: "-0.015em",
    uppercase: "none",
    gridLine: dark ? "#1e242e" : "#eef0f3",
  };
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function cssVarMap(tokens: ThemeTokens): Record<string, string> {
  return {
    "--bg": tokens.bg,
    "--bg-subtle": tokens.bgSubtle,
    "--card": tokens.card,
    "--card-alt": tokens.cardAlt,
    "--line": tokens.line,
    "--line-strong": tokens.lineStrong,
    "--fg": tokens.fg,
    "--fg-muted": tokens.fgMuted,
    "--fg-subtle": tokens.fgSubtle,
    "--primary": tokens.primary,
    "--primary-fg": tokens.primaryFg,
    "--accent": tokens.accent,
    "--positive": tokens.positive,
    "--warn": tokens.warn,
    "--danger": tokens.danger,
    "--radius": tokens.radius,
    "--radius-sm": tokens.radiusSm,
    "--shadow": tokens.shadow,
    "--shadow-sm": tokens.shadowSm,
    "--heading-weight": tokens.headingWeight,
    "--tracking": tokens.tracking,
    "--grid-line": tokens.gridLine,
  };
}

export const DEFAULT_CUSTOM: CustomThemeInput = {
  primary: "#2563eb",
  accent: "#14b8a6",
  background: "#f6f7f9",
  card: "#ffffff",
  radius: 14,
  mode: "light",
};
