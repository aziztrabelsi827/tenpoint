import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * STATIC GUARD (runnable without a database or an SMTP provider)
 * =============================================================
 * These templates ship ready-to-paste into the Supabase dashboard (Authentication
 * -> Email Templates). The real rendering and delivery can only be verified once
 * they are pasted into a project with Custom SMTP configured (NOT TESTED here).
 * This test enforces the thing that is easy to break silently: every template
 * must keep the Supabase-provided placeholders that produce the working
 * confirmation/recovery links (`{{ .ConfirmationURL }}` etc.).
 */

const DIR = resolve(process.cwd(), "supabase/email-templates");
const FILES = [
  "confirm-signup.html",
  "reset-password.html",
  "change-email.html",
  "magic-link.html",
  "invite.html",
] as const;

function read(name: string): string {
  return readFileSync(resolve(DIR, name), "utf8");
}

describe("branded email templates (static guard)", () => {
  it.each(FILES)("%s exists and has the shared TenPoint card layout", (file) => {
    const html = read(file);
    expect(html).toContain("TenPoint");
    expect(html).toContain("#2563eb");
    expect(html).toContain('{{ .ConfirmationURL }}');
    // The CTA must actually link to the Supabase confirmation URL.
    expect(html).toMatch(/href="\{\{ \.ConfirmationURL \}\}"/);
  });

  it("keeps the recovery and invite link tokens intact", () => {
    for (const file of ["reset-password.html", "invite.html", "magic-link.html"]) {
      const html = read(file);
      expect(html).toContain('{{ .ConfirmationURL }}');
    }
  });

  it("uses {{ .NewEmail }} only in the change-email template", () => {
    expect(read("change-email.html")).toContain("{{ .NewEmail }}");
    for (const file of FILES.filter((f) => f !== "change-email.html")) {
      expect(read(file)).not.toContain("{{ .NewEmail }}");
    }
  });

  it("never inlines a raw token as visible clickable text", () => {
    // We intentionally do NOT print `{{ .Token }}` anywhere in the visible body
    // of the templates (the confirmation URL alone is the action link).
    for (const file of FILES) {
      expect(read(file)).not.toContain("{{ .Token }}");
    }
  });
});