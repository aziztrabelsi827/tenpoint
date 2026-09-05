"use client";

/**
 * Root error boundary. Catches failures that escape every nested boundary,
 * including layout-level errors.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f4f5f7",
          color: "#16191f",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: "28rem", margin: "18vh auto 0", padding: "0 1rem" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e5ea",
              borderRadius: 12,
              padding: "2rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#8c94a3" }}>
              APPLICATION ERROR
            </p>
            <h1 style={{ fontSize: 24, margin: "0.5rem 0 0" }}>TenPoint could not load</h1>
            <p style={{ fontSize: 14, color: "#5b6270", marginTop: 8 }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 20,
                padding: "0.5rem 1rem",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
