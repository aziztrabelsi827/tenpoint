"use client";

import { useId, useMemo, useState } from "react";
import { dayKey, fromKey, MONTH_SHORT, WEEKDAY_MIN } from "@/lib/dates";
import { formatPoints, formatPercent, ratio } from "@/lib/format";
import type { Bucket } from "@/lib/stats";

/* ---------------------------------------------------------------- */
/* Progress ring                                                    */
/* ---------------------------------------------------------------- */

export function ProgressRing({
  value,
  max,
  size = 168,
  thickness = 14,
  color,
  label,
  sublabel,
}: {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(1, value / max);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const [hover, setHover] = useState(false);
  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={thickness} />
        <circle
          className="ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? "var(--primary)"}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p
          className="num font-bold leading-none"
          style={{ fontSize: size * 0.22, letterSpacing: "var(--tracking)" }}
        >
          {label ?? `${value}/${max}`}
        </p>
        {sublabel ? (
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
            {sublabel}
          </p>
        ) : null}
      </div>
      {hover ? null : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Line / area chart                                                */
/* ---------------------------------------------------------------- */

export type LinePoint = { key: string; score: number; total: number };

export function LineChart({
  data,
  height = 200,
  showArea = true,
  color,
}: {
  data: LinePoint[];
  height?: number;
  showArea?: boolean;
  color?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 1000;
  const H = 300;
  const pad = { l: 6, r: 6, t: 16, b: 22 };

  const { path, area, maxV, pts } = useMemo(() => {
    if (data.length === 0) return { path: "", area: "", maxV: 10, pts: [] as { x: number; y: number }[] };
    const maxV = niceMax(data.map((d) => d.total || 1));
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const step = data.length === 1 ? 0 : innerW / (data.length - 1);
    const pts = data.map((d, i) => ({
      x: pad.l + i * step,
      y: pad.t + innerH - (d.score / maxV) * innerH,
    }));
    const path = pts
      .map((p, i) => {
        if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
        const prev = pts[i - 1];
        const cx = (prev.x + p.x) / 2;
        return `C ${cx.toFixed(2)} ${prev.y.toFixed(2)} ${cx.toFixed(2)} ${p.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      })
      .join(" ");
    const area = `${path} L ${pts[pts.length - 1].x.toFixed(2)} ${H - pad.b} L ${pts[0].x.toFixed(2)} ${H - pad.b} Z`;
    return { path, area, maxV, pts };
  }, [data, pad.b, pad.l, pad.r, pad.t]);

  if (data.length === 0) {
    return (
      <div className="grid h-40 place-items-center text-sm" style={{ color: "var(--fg-muted)" }}>
        No data in this range yet.
      </div>
    );
  }

  const active = hoverIdx !== null ? data[hoverIdx] : null;
  const activePt = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Daily score chart"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (data.length - 1));
          setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color ?? "var(--primary)"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color ?? "var(--primary)"} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + f * (H - pad.t - pad.b)}
            y2={pad.t + f * (H - pad.t - pad.b)}
            stroke="var(--grid-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {showArea ? <path d={area} fill={`url(#g${gid})`} /> : null}
        <path
          d={path}
          fill="none"
          stroke={color ?? "var(--primary)"}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {activePt ? (
          <>
            <line
              x1={activePt.x}
              x2={activePt.x}
              y1={pad.t}
              y2={H - pad.b}
              stroke="var(--line-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={activePt.x} cy={activePt.y} r="5" fill={color ?? "var(--primary)"} vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 text-[10px]" style={{ color: "var(--fg-subtle)" }}>
        <span>{fmtTick(data[0].key)}</span>
        <span>{fmtTick(data[Math.floor(data.length / 2)].key)}</span>
        <span>{fmtTick(data[data.length - 1].key)}</span>
      </div>
      {active ? (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap border px-2 py-1 text-xs font-semibold"
          style={{
            background: "var(--card)",
            borderColor: "var(--line)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-sm)",
            maxWidth: "calc(100% - 0.5rem)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fmtTick(active.key)} · {formatPoints(active.score)}/{formatPoints(active.total)} pts ·{" "}
          {formatPercent(ratio(active.score, active.total))}
        </div>
      ) : null}
      <span className="sr-only">Maximum daily score on this chart: {maxV}</span>
    </div>
  );
}

/** Picks a readable axis maximum for decimal point totals. */
function niceMax(values: number[]): number {
  const raw = Math.max(1, ...values);
  if (raw <= 5) return Math.ceil(raw * 2) / 2;
  return Math.ceil(raw);
}

function fmtTick(key: string): string {
  const d = fromKey(key);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/* ---------------------------------------------------------------- */
/* Bar chart                                                        */
/* ---------------------------------------------------------------- */

export function BarChart({
  data,
  height = 200,
  color,
  unit = "pts",
}: {
  data: Bucket[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return (
      <div className="grid h-40 place-items-center text-sm" style={{ color: "var(--fg-muted)" }}>
        No data yet.
      </div>
    );
  }
  const maxV = niceMax(data.map((d) => d.total || 1));
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-full items-end gap-1" style={{ minHeight: 120 }}>
        {data.map((d, i) => {
          const h = Math.max(2, ((d as { rating: number }).rating / maxV) * 100);
          const isHover = hover === i;
          return (
            <div
              key={d.key + i}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              style={{ height: "100%" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="w-full transition-[height] duration-500"
                style={{
                  height: `${h}%`,
                  background: (d as { rating: number }).rating === 0 ? "var(--bg-subtle)" : color ?? "var(--primary)",
                  borderRadius: "var(--radius-sm)",
                  opacity: isHover ? 1 : 0.88,
                  outline: isHover ? "2px solid var(--line-strong)" : "none",
                }}
              />
              <span className="w-full truncate text-center text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                {d.label}
              </span>
              {isHover ? (
                <div
                  className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap border px-2 py-1 text-[11px] font-semibold"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--line)",
                    borderRadius: "var(--radius-sm)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {formatPoints((d as { rating: number }).rating)} {unit}
                  {d.total > 0
                    ? ` · ${formatPercent(ratio((d as { rating: number }).rating, d.total))}`
                    : ""}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Heatmap                                                          */
/* ---------------------------------------------------------------- */

export function Heatmap({
  weeks,
  color = "var(--primary)",
  onCellClick,
  cellSize = 12,
}: {
  weeks: { key: string; score: number; total: number }[][];
  color?: string;
  onCellClick?: (key: string) => void;
  cellSize?: number;
}) {
  const gap = 3;
  const totalDays = weeks.reduce((acc, w) => acc + w.length, 0);
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="min-w-max">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const intensity = day.total === 0 ? 0 : day.score / day.total;
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={onCellClick ? () => onCellClick(day.key) : undefined}
                    title={`${day.key} — ${day.score}/${day.total} points`}
                    aria-label={`${day.key}: ${day.score} of ${day.total} points`}
                    className="transition-transform duration-150 hover:scale-[1.35]"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: `calc(var(--radius-sm) * 0.35)`,
                      background:
                        intensity === 0
                          ? day.total === 0
                            ? "var(--bg-subtle)"
                            : "var(--bg-subtle)"
                          : `color-mix(in srgb, ${color} ${Math.round(22 + intensity * 78)}%, var(--card))`,
                      border: "1px solid var(--grid-line)",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>
          {totalDays} days tracked · less
          <span className="mx-1 inline-flex gap-[2px] align-middle">
            {[0, 0.25, 0.5, 0.75, 1].map((i) => (
              <span
                key={i}
                style={{
                  width: 9,
                  height: 9,
                  display: "inline-block",
                  borderRadius: 2,
                  background:
                    i === 0
                      ? "var(--bg-subtle)"
                      : `color-mix(in srgb, ${color} ${Math.round(22 + i * 78)}%, var(--card))`,
                  border: "1px solid var(--grid-line)",
                }}
              />
            ))}
          </span>
          more
        </p>
      </div>
    </div>
  );
}

export function buildWeeks(
  keys: { key: string; score: number; total: number }[],
): { key: string; score: number; total: number }[][] {
  const byKey = new Map(keys.map((k) => [k.key, k]));
  if (keys.length === 0) return [];
  const first = fromKey(keys[0].key);
  // pad to Monday
  const padStart = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - padStart * 86400000);
  const last = fromKey(keys[keys.length - 1].key);
  const weeks: { key: string; score: number; total: number }[][] = [];
  let cursor = new Date(start);
  let guard = 0;
  while (cursor <= last || guard > 600) {
    const week: { key: string; score: number; total: number }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const k = dayKey(cursor);
      week.push(byKey.get(k) ?? { key: k, score: 0, total: 0 });
      cursor = new Date(cursor.getTime() + 86400000);
    }
    weeks.push(week);
    if (cursor > last) break;
    guard += 1;
  }
  return weeks;
}

/* ---------------------------------------------------------------- */
/* Horizontal comparison bars                                       */
/* ---------------------------------------------------------------- */

export function CompareBars({
  rows,
}: {
  rows: { label: string; icon: string; value: number; color: string; sub?: string }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="grid h-32 place-items-center text-sm" style={{ color: "var(--fg-muted)" }}>
        Nothing to compare yet.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-6 text-center text-base" aria-hidden>
            {r.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{r.label}</span>
              <span className="num text-xs font-bold" style={{ color: "var(--fg-muted)" }}>
                {r.value}%
              </span>
            </div>
            <div
              className="w-full overflow-hidden"
              style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 999 }}
            >
              <div
                className="progress-fill h-full"
                style={{
                  width: `${r.value}%`,
                  background: r.color,
                  borderRadius: 999,
                  transition: "width .6s cubic-bezier(.22,1,.36,1)",
                }}
              />
            </div>
            {r.sub ? (
              <p className="mt-1 text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                {r.sub}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Streak strip                                                     */
/* ---------------------------------------------------------------- */

export function StreakStrip({
  keys,
  done,
  color,
}: {
  keys: string[];
  done: Set<string>;
  color: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => {
        const isDone = done.has(k);
        return (
          <span
            key={k}
            title={`${k}${isDone ? " — completed" : " — missed"}`}
            className="animate-pop"
            style={{
              width: 14,
              height: 22,
              borderRadius: 4,
              background: isDone ? color : "var(--bg-subtle)",
              border: `1px solid ${isDone ? color : "var(--line)"}`,
            }}
          />
        );
      })}
    </div>
  );
}

export function WeekdayLegend() {
  return (
    <div className="flex gap-1.5 text-[10px]" style={{ color: "var(--fg-subtle)" }}>
      {WEEKDAY_MIN.map((d, i) => (
        <span key={i} className="w-3 text-center">
          {d}
        </span>
      ))}
    </div>
  );
}

export function MonthLabels(keys: string[]) {
  const seen = new Set<string>();
  for (const k of keys) {
    const d = fromKey(k);
    seen.add(MONTH_SHORT[d.getUTCMonth()]);
  }
  return <span className="text-[10px]">{[...seen].join(" · ")}</span>;
}
