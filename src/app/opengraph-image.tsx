import { ImageResponse } from "next/og";

export const alt = "TenPoint — daily habit tracker, planner & productivity dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const dots = Array.from({ length: 10 }, (_, i) => i + 1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0d1015 0%, #141c2b 55%, #1b2440 100%)",
          color: "#e8ecf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 76,
              height: 76,
              borderRadius: 20,
              background: "#2563eb",
              color: "#ffffff",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            10
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
              TenPoint
            </div>
            <div style={{ display: "flex", fontSize: 20, color: "#9aa5b6" }}>
              Habit workspace · score every day out of 10
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 84 }}>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>
            Rate your day. Not your goals.
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#c3cbd9", marginTop: 14, maxWidth: 900 }}>
            Positive habits and measurable tasks add to a daily rating, negative habits subtract from
            it — streaks, heatmaps and focus timer included.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 44 }}>
          {["Habits", "Tasks", "Pomodoro", "Calendar", "Analytics"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(37, 99, 235, 0.16)",
                border: "1px solid rgba(96, 165, 250, 0.35)",
                color: "#dbeafe",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: "auto" }}>
          <span style={{ fontSize: 14, color: "#8c94a3", letterSpacing: 2 }}>TODAY&apos;S RATING</span>
          <div style={{ display: "flex", gap: 8 }}>
            {dots.map((n) => (
              <div
                key={n}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: n <= 7 ? "#2563eb" : "rgba(148, 163, 184, 0.25)",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#8ab4ff", marginLeft: 8 }}>
            7/10
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}