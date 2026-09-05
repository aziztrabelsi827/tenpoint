import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * These are conservative defaults that do not interfere with Next.js's own
 * scripting or inline styles (the app uses inline <script> for the theme boot
 * and JSON-LD, so CSP is deliberately permissive for those two cases).
 *
 * `unsafe-eval` is only needed by Next.js's development error overlay, so it is
 * stripped from the production Content-Security-Policy.
 */
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  // Prevent clickjacking by forbidding embedding in a frame.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers guessing a MIME type that differs from the declared one.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin to same-site destinations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable the legacy browser feature policy.
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Hide the server framework from response headers.
  { key: "X-Powered-By", value: "" },
  // Baseline CSP. 'unsafe-inline' is required for the theme boot script and
  // JSON-LD blocks; 'unsafe-eval' is only required for the Next.js dev overlay.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
