"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. A failure in one screen degrades to a clear
 * recovery action rather than an unhandled white page.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for server-side/terminal logging without leaking it to
    // the rendered UI.
    console.error("[TenPoint] route error:", error.message);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-bold">This screen failed to load</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          Your data has not been lost. Reloading usually resolves this. If the problem persists, check your
          database connection.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <a href="/dashboard" className="btn">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
