"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Segmented, Stat, useToast } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { buildCustomTokens, cssVarMap, THEME_LIST, type CustomThemeInput, type ThemeId } from "@/lib/themes";
import { formatPoints } from "@/lib/format";
import {
  TIMEZONE_CHOICES,
  detectTimezone,
  todayInZone,
  timezoneLabel,
  timezoneOffsetLabel,
} from "@/lib/timezone";

const CUSTOM_PRESETS: { label: string; value: CustomThemeInput }[] = [
  { label: "Indigo light", value: { primary: "#4f46e5", accent: "#06b6d4", background: "#f5f5fb", card: "#ffffff", radius: 16, mode: "light" } },
  { label: "Midnight", value: { primary: "#7c9cff", accent: "#22d3ee", background: "#0a0d14", card: "#141924", radius: 14, mode: "dark" } },
  { label: "Terracotta", value: { primary: "#c2653f", accent: "#8a9a5b", background: "#faf5ef", card: "#ffffff", radius: 20, mode: "light" } },
  { label: "Slate pro", value: { primary: "#0f766e", accent: "#f59e0b", background: "#f1f5f9", card: "#ffffff", radius: 10, mode: "light" } },
];

export function SettingsView({ userName }: { userName: string }) {
  const {
    settings, saveSettings, setTheme, habits, tasks, events, focus, logs,
    MAX_HABITS, today,
  } = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(userName);
  const [savingName, setSavingName] = useState(false);

  const [theme, setThemeState] = useState<ThemeId>((settings.theme as ThemeId) ?? "productivity");
  const [custom, setCustom] = useState<CustomThemeInput>({
    primary: settings.customPrimary,
    accent: settings.customAccent,
    background: settings.customBackground,
    card: settings.customCard,
    radius: settings.customRadius,
    mode: settings.customMode,
  });
  const [timer, setTimer] = useState({
    focusMinutes: settings.focusMinutes,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    sessionsBeforeLongBreak: settings.sessionsBeforeLongBreak,
  });

  const totalOccurrences = habits.reduce((acc, h) => {
    const dayMap = logs[String(h.id)] ?? {};
    return acc + Object.values(dayMap).reduce((a, entry) => a + entry.count, 0);
  }, 0);
  const dailyPoints = habits
    .filter((h) => h.enabled && h.kind === "positive")
    .reduce((acc, h) => acc + h.pointValue, 0);
  const positiveCount = habits.filter((h) => h.enabled && h.kind === "positive").length;
  const negativeCount = habits.filter((h) => h.enabled && h.kind === "negative").length;

  function applyTheme(next: ThemeId, nextCustom?: CustomThemeInput) {
    const c = nextCustom ?? custom;
    setThemeState(next);
    setTheme(next, next === "custom" ? c : undefined);
    void saveSettings({ theme: next, ...(next === "custom" ? {
      customPrimary: c.primary,
      customAccent: c.accent,
      customBackground: c.background,
      customCard: c.card,
      customRadius: c.radius,
      customMode: c.mode,
    } : {}) });
  }

  function updateCustom(patch: Partial<CustomThemeInput>) {
    const next = { ...custom, ...patch };
    setCustom(next);
    setThemeState("custom");
    setTheme("custom", next);
  }

  async function saveName() {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      toast.push("Display name cannot be empty.", "error");
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push(body?.error || "Could not save your display name.", "error");
        return;
      }
      // Persist the authoritative value returned by the server so the field
      // never drifts from what was actually saved, then refresh the server
      // components (AppShell sidebar + dashboard greeting) in place.
      const persisted = body?.name?.trim() || trimmed;
      setDisplayName(persisted);
      toast.push("Display name saved");
      router.refresh();
    } catch {
      toast.push("Could not save your display name.", "error");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Preferences</p>
        <h1 className="mt-1 text-3xl font-bold">Settings &amp; themes</h1>
        <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--fg-muted)" }}>
          Themes are driven by design tokens, so switching one restyles every screen instantly. Your choice is
          saved to your account and applied on every device.
        </p>
      </header>

      <section aria-labelledby="themes">
        <h2 id="themes" className="mb-4 text-xl font-semibold">
          Appearance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_LIST.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => (t.id === "custom" ? applyTheme("custom") : applyTheme(t.id))}
                className="card flex flex-col gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
                style={{
                  borderColor: active ? "var(--primary)" : "var(--line)",
                  boxShadow: active ? "0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)" : "var(--shadow-sm)",
                }}
                aria-pressed={active}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{t.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                      {t.tagline}
                    </p>
                  </div>
                  {active ? (
                    <span className="chip" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
                      Active
                    </span>
                  ) : null}
                </div>
                <div
                  className="flex gap-1.5 p-2.5"
                  style={{ background: t.swatch[0], borderRadius: "var(--radius-sm)", border: "1px solid var(--line)" }}
                >
                  {t.swatch.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        background: c,
                        height: 26,
                        flex: i === 0 ? 3 : 1,
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  {t.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {theme === "custom" ? (
        <section className="card p-5" aria-labelledby="custom-theme">
          <h2 id="custom-theme" className="mb-1 text-xl font-semibold">
            Custom theme builder
          </h2>
          <p className="mb-4 text-sm" style={{ color: "var(--fg-muted)" }}>
            Pick your own tokens. Changes apply live across the whole app.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(
              [
                ["primary", "Primary colour"],
                ["accent", "Accent colour"],
                ["background", "Background colour"],
                ["card", "Card colour"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="field-label" htmlFor={`c-${key}`}>
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`c-${key}`}
                    type="color"
                    value={custom[key]}
                    onChange={(e) => updateCustom({ [key]: e.target.value })}
                    className="h-10 w-14 cursor-pointer border"
                    style={{ borderRadius: "var(--radius-sm)", borderColor: "var(--line)", background: "var(--card)" }}
                  />
                  <input
                    className="input num"
                    value={custom[key]}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) updateCustom({ [key]: v });
                    }}
                    aria-label={`${label} hex value`}
                  />
                </div>
              </div>
            ))}
            <div>
              <label className="field-label" htmlFor="c-radius">
                Border radius — {custom.radius}px
              </label>
              <input
                id="c-radius"
                type="range"
                min={0}
                max={28}
                value={custom.radius}
                onChange={(e) => updateCustom({ radius: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <span className="field-label">Mode</span>
              <Segmented
                ariaLabel="Light or dark mode"
                value={custom.mode}
                onChange={(mode) => updateCustom({ mode })}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </div>
          </div>
          <div className="mt-5">
            <p className="field-label">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setCustom(p.value);
                    applyTheme("custom", p.value);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                applyTheme("custom");
                toast.push("Custom theme saved");
              }}
            >
              Save custom theme
            </button>
            <button type="button" className="btn" onClick={() => applyTheme("productivity")}>
              Reset to default
            </button>
          </div>
          <div
            className="mt-5 flex flex-wrap items-center gap-3 p-4"
            style={{ ...cssVarMap(buildCustomTokens(custom)), borderRadius: "var(--radius)", border: "1px solid var(--line)" } as React.CSSProperties}
          >
            <span
              style={{
                background: "var(--primary)",
                color: "var(--primary-fg)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Primary button
            </span>
            <span
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                color: "var(--fg)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Card surface
            </span>
            <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>Muted text · tabular 0123456789</span>
          </div>
        </section>
      ) : null}

      <section className="card p-5" aria-labelledby="timezone">
        <h2 id="timezone" className="mb-1 text-xl font-semibold">
          Timezone
        </h2>
        <p className="mb-4 text-sm" style={{ color: "var(--fg-muted)" }}>
          Your timezone decides what <strong>today</strong> means. It drives the daily rating, the habit
          calendar, streaks and the calendar — so the day rolls over at <em>your</em> midnight, not UTC.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[min(14rem,100%)]">
            <label className="field-label" htmlFor="tz">
              IANA timezone
            </label>
            <select
              id="tz"
              className="input w-full min-w-0"
              value={settings.timezone}
              onChange={(e) => {
                const tz = e.target.value;
                void saveSettings({ timezone: tz });
                toast.push(`Timezone set to ${tz} — today is ${todayInZone(tz)}`);
              }}
            >
              {[...new Set([settings.timezone, ...TIMEZONE_CHOICES])]
                .filter(Boolean)
                .sort()
                .map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            className="btn min-w-0 max-sm:w-full max-sm:whitespace-normal max-sm:leading-snug"
            onClick={() => {
              const detected = detectTimezone();
              if (!detected) {
                toast.push("Your browser did not report a timezone.", "error");
                return;
              }
              void saveSettings({ timezone: detected });
              toast.push(`Using ${detected} — today is ${todayInZone(detected)}`);
            }}
          >
            Use my browser timezone
          </button>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
          Today is <strong>{today}</strong> · local offset{" "}
          <strong>{timezoneOffsetLabel(settings.timezone)}</strong> · shown on the calendar as{" "}
          <strong>{timezoneLabel(settings.timezone)}</strong>
        </p>
      </section>

      <section className="card p-5" aria-labelledby="timer-defaults">
        <h2 id="timer-defaults" className="mb-1 text-xl font-semibold">
          Timer defaults
        </h2>
        <p className="mb-4 text-sm" style={{ color: "var(--fg-muted)" }}>
          These durations pre-fill the Pomodoro timer whenever you open it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["focusMinutes", "Focus (min)", 1, 180],
              ["shortBreakMinutes", "Short break (min)", 1, 60],
              ["longBreakMinutes", "Long break (min)", 1, 90],
              ["sessionsBeforeLongBreak", "Sessions before long break", 2, 8],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key}>
              <label className="field-label" htmlFor={`t-${key}`}>
                {label}
              </label>
              <input
                id={`t-${key}`}
                type="number"
                min={min}
                max={max}
                className="input"
                value={timer[key]}
                onChange={(e) =>
                  setTimer((d) => ({ ...d, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) }))
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={() => {
            void saveSettings(timer);
            toast.push("Timer defaults saved");
          }}
        >
          Save timer defaults
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-labelledby="account">
        <h2 id="account" className="sr-only">
          Account
        </h2>
        <Stat
          label="Habits tracked"
          value={`${habits.length}/${MAX_HABITS}`}
          sub={`${positiveCount} positive · ${negativeCount} negative`}
        />
        <Stat
          label="Positive weight"
          value={formatPoints(dailyPoints)}
          sub={Math.abs(dailyPoints - 10) > 0.01 ? "Aim for 10 so a full day is 10/10" : "A full day is exactly 10/10"}
          accent={Math.abs(dailyPoints - 10) > 0.01 ? "var(--warn)" : "var(--positive)"}
        />
        <Stat label="Occurrences logged" value={totalOccurrences} sub="Across every habit, all time" accent="var(--accent)" />
        <Stat label="Tasks" value={tasks.length} accent="var(--accent)" />
        <Stat label="Calendar events" value={events.length} accent="var(--warn)" />
        <Stat label="Focus sessions" value={focus.length} accent="var(--positive)" />
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-xl font-semibold">Workspace</h2>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          TenPoint is a private, sign-in-protected workspace — your habits, tasks, calendar and history are
          synced to your account and yours alone.
        </p>
        <div className="mt-4 max-w-sm">
          <label className="field-label" htmlFor="display-name">
            Display name <span style={{ color: "var(--fg-subtle)" }}>(used in the dashboard greeting)</span>
          </label>
          <input
            id="display-name"
            className="input"
            value={displayName}
            maxLength={60}
            placeholder="e.g. Alex"
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={savingName}
            onClick={() => void saveName()}
          >
            {savingName ? "Saving…" : "Save display name"}
          </button>
        </div>
      </section>
    </div>
  );
}
