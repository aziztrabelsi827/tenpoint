"use client";

import { useLayoutEffect } from "react";
import { buildCustomTokens, cssVarMap, type CustomThemeInput } from "@/lib/themes";

/**
 * Applies the authenticated user's persisted theme that lives in the DB.
 *
 * Why a client component and not a raw inline <script>:
 * - The workspace layout is reconciled as a React element on the client during
 *   App Router client-side navigation (e.g. after logout -> login). A raw
 *   classic <script> rendered there throws React's "Encountered a script tag
 *   while rendering" client error. Attribute/side-effect styling through DOM
 *   APIs does not, and cannot be string-injected.
 * - This runs in useLayoutEffect, i.e. synchronously after the DOM commit and
 *   before the browser paints, so the theme is visible before first paint.
 *
 * Single source of truth for pre-hydration remains the inline boot script in
 * the root layout, which reads localStorage set here (same contract used by the
 * settings view). So on the next full load/refresh the theme is applied before
 * hydration with zero flash, and this effect only needs to sync the DB value the
 * first time.
 */
export function ThemeBoot({
  theme,
  custom,
}: {
  theme: string;
  custom: CustomThemeInput | null;
}) {
  useLayoutEffect(() => {
    try {
      const el = document.documentElement;
      const tokens = custom ? buildCustomTokens(custom) : null;

      el.removeAttribute("style");
      el.setAttribute("data-theme", theme);
      if (tokens) {
        const vars = cssVarMap(tokens);
        for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
      }

      localStorage.setItem(
        "tenpoint.theme",
        JSON.stringify({ theme, custom: custom ?? null }),
      );
    } catch {
      // ignore: theme application is non-critical and must never crash the app
    }
  }, [theme, custom]);

  return null;
}
