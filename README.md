# TenPoint — Habit Tracking & Productivity Dashboard

A multi-user daily scorecard: track habits and tasks, rate every day out of 10,
and keep a calendar + statistics view — all under your own Supabase-backed
account.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 ·
Supabase (Auth + PostgREST + Postgres + Row Level Security).

---

## Core concepts (non-negotiables)

- **Daily rating is always 0–10.** No lifetime point accumulation.
- **Your IANA timezone is the source of truth for "today."** The calendar day is
  derived from your stored timezone (`todayInZone`), never from UTC.
- **Changing your timezone never rewrites historical day keys.** The day keys
  already stored keep their meaning; only the meaning of "today" changes.
- **Records are snapshots.** Once a habit log, task progress, or rating is stored
  for a day, changing the habit/task configuration (weight, target, type, days)
  never silently rewrites that past day. Historical days keep the snapshot;
  today and the future compute from current configuration.
- **A recorded `0` is real.** An explicit zero log is a record that the habit
  participated in that day, not a missing one.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** (or use a local one via the Supabase CLI) and
   grab the URL and the anon key. The service-role key is optional (see below).

3. **Environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the values. See `src/lib/supabase/config.ts` for how they're read.

4. **Deploy the schema & RLS migrations**

   The SQL migrations under `supabase/migrations/` are the authoritative schema
   source. Apply them with the Supabase CLI:

   ```bash
   supabase db push --linked
   # or, against your cloud project:
   supabase db push --db-url "$SUPABASE_DB_URL"
   ```

   `0001_initial.sql` creates every table (profiles, habits, logs, occurrences,
   tasks, progress, events, focus sessions, user settings), their indexes and
   constraints, enables Row Level Security with per-user policies, and installs
   an `on_auth_user_created` trigger that provisions each user's profile row.
   `0002_occurrence_toggle_rpc.sql` installs the atomic occurrence-toggle RPC
   and the health-check RPC.

5. **Run it**

   ```bash
   npm run dev        # http://localhost:3000
   ```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start the dev server                     |
| `npm run build`    | Production build                         |
| `npm start`        | Serve the production build               |
| `npm run lint`     | ESLint                                   |
| `npm run typecheck`| `tsc --noEmit`                           |
| `npm test`         | Vitest (scoring, timezone, historical, rate-limit, auth, migration guard) |

## Architecture

- **Auth:** Supabase Auth. Sessions live in httpOnly cookies via
  `@supabase/ssr` (see `src/lib/supabase/server.ts`). There is **no** custom
  JWT, bcrypt hashing, or separate cookie session. Middleware refreshes the
  session and guards routes; server components and API routes independently
  validate the session (`requireUser` / `requireUserId` in `src/lib/auth.ts`).
- **Database (data access):** every user-owned row is read and written through
  the **authenticated Supabase server client** (`getSupabaseServerClient()`),
  which attaches the session JWT to each PostgREST request. Row Level Security
  (`user_id = auth.uid()`) is therefore authoritative at the database on the
  app path. There is **no** direct Drizzle/node-postgres connection in the
  runtime path — a direct pool would connect as an RLS-exempt role and
  undermine isolation. Each API route resolves the session once via
  `requireUserContext()` (in `src/lib/auth.ts`) and scopes every query to that
  authenticated `user_id`. The atomic occurrence toggle runs as a `SECURITY
  INVOKER` PostgREST RPC (`handle_occurrence_toggle`) so it stays under RLS
  while preserving its row-locked, atomic write.
- **Scoring:** a single source of truth — `src/lib/scoring.ts` computes every
  rating, day score, contribution, and historical snapshot. Nothing else may
  calculate a daily rating.
- **Timezone:** `src/lib/timezone.ts` is the only sanctioned way to turn "now"
  into a local calendar-day key (`todayInZone`).

## Security

- **Row Level Security** is enabled on every owned table with per-user policies
  (`user_id = auth.uid()`), so an account can never read or write another's rows
  even if application-level checks were bypassed. RLS is enforced on the app
  path because all data access goes through the authenticated Supabase client
  (and `SECURITY INVOKER` RPCs), never through an RLS-exempt admin connection.
- **Security headers** (`X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, CSP, etc.) are applied in `next.config.ts`. `unsafe-eval` is
  stripped from the production CSP (only needed by the dev overlay).
- **Service-role key** is server-only and never reaches the client; it is used
  only for explicit administrative tasks (e.g. profile provisioning) and is
  optional when a DB trigger handles provisioning.

### Rate limiting

Login, signup, and password-reset endpoints are rate-limited per IP
(`src/lib/rate-limit.ts`). **The current limiter is in-memory and correct only
for a single instance / dev.** For a horizontally scaled deployment it must be
swapped for a shared store (e.g. Redis) while keeping the same `rateLimit`
interface — callers need no changes.

### Email delivery (Resend + Supabase Auth SMTP)

TenPoint keeps **Supabase Auth** in charge of authentication and **Resend** in
charge of delivery. The application never generates confirmation tokens or sends
email itself — it only calls `supabase.auth.signUp()`,
`supabase.auth.resetPasswordForEmail()`, and `supabase.auth.updateUser()` (for
email changes). Email **confirmation is disabled** in the project settings, so
signup returns an authenticated session immediately and the user never sees a
"check your email" screen. The SMTP credentials live in the **Supabase project
settings**, never in the browser and never in a `NEXT_PUBLIC_*` variable.

Architecture:

```
TENPOINT (Next.js) -> SUPABASE AUTH -> RESEND SMTP -> USER INBOX
        signup (instant session) / reset / login     branded sender
```

**1. Create & verify a Resend account and domain**
- Create an account at https://resend.com.
- Add the domain you will send authentication mail from. Prefer a **dedicated
  authentication subdomain** (e.g. `auth.your-domain.com`) so its deliverability
  reputation is separate from any marketing domain. Keep auth mail transactional
  and never mix newsletters/ads into it.
- Add the DNS records Resend gives you in your domain provider and click Verify.

**2. Configure SPF / DKIM / DMARC**
- **SPF:** Resend provides an SPF record (`include:amazonses.com`) on the
  verification DNS record set. Keep your SPF record in one TXT record only (SPF
  only allows a single record) and include all legitimate senders.
- **DKIM:** add the TXT record(s) Resend provides. This is what makes
  `d=your-domain` appear in the `Authentication-Results` header.
- **DMARC:** publish a `_dmarc` record, for example
  `v=DMARC1; p=none; rua=mailto:dmarc@your-domain.com` to start monitoring, then
  tighten to `p=quarantine` or `p=reject` once confirmed. This tells receiving
  mailboxes how to treat unauthenticated mail.
- Only once the domain status in Resend shows **Verified** (SPF/DKIM/DMARC green)
  can the branded sender be considered production-ready.

**3. Configure Supabase Custom SMTP**
- Open Supabase Dashboard → Authentication → Sign In / Providers → Email →
  turn on **Custom SMTP**.
- Use the **Resend** SMTP settings (from Resend Dashboard → Domains → SMTP):
  | Setting                 | Value                          |
  | ----------------------- | ------------------------------ |
  | SMTP host               | `smtp.resend.com`              |
  | SMTP port               | `465` (SSL) or `587` (STARTTLS)|
  | SMTP username           | `resend`                       |
  | SMTP password           | the **SMTP password** from Resend (not the API key) |
  | Require secure connection | On                          |
- Put the **sender** the user's inbox should show:
  | Setting        | Value                                             |
  | -------------- | ------------------------------------------------ |
  | Sender email   | `no-reply@auth.your-domain.com` (verified domain) |
  | Sender name    | `TenPoint`                                        |
- Do **not** expose the SMTP password or a Resend API key to the browser, and
  do not add `NEXT_PUBLIC_RESEND_API_KEY`. If the app later needs to send product
  email server-side, keep the key server-only (e.g. `RESEND_API_KEY`).

**4. Configure Supabase Auth templates**
- Dashboard → Authentication → Email Templates. Customize the branded templates
  (**Confirm signup**, **Reset password**, **Change email**; Magic link / Invite
  only if enabled). Keep the Supabase-provided template variables intact so the
  generated confirmation/recovery links still work:
  - `{{ .ConfirmationURL }}` / `{{ .SiteURL }}` / `{{ .Token }}` where shown in
    each template.
  - Do **not** invent variable names — open the default template to see the exact
    variables available for that email.
- Ready-to-paste TenPoint-branded templates ship in
  `supabase/email-templates/` (confirm-signup, reset-password, change-email,
  magic-link, invite). Each is a single self-contained HTML file with inline
  (email-safe) CSS, white/very-light background, TenPoint blue accent
  (`#2563eb`), a strong CTA button and a small footer with a security note.
  Suggested subjects are listed in a comment at the top of each file. The
  templates are purely transactional — no marketing content.

### Template variables (verified against the official Supabase docs)

| Variable | When available |
| --- | --- |
| `{{ .ConfirmationURL }}` | signup, invite, magic link, reset, change email |
| `{{ .Token }}` / `{{ .TokenHash }}` | signup, invite, magic link, reset |
| `{{ .SiteURL }}` | all |
| `{{ .RedirectTo }}` | all |
| `{{ .Email }}` | all |
| `{{ .NewEmail }}` | change email only |
| `{{ .Data }}` | all (user metadata) |

**5. Configure redirect URLs**
- Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**
  must allow every origin the app actually uses:
  - `http://localhost:3000/**` (local dev — confirm links land on
    `/auth/callback`).
  - `https://your-domain.com/**` (production).
  - Add `http://localhost:3000/auth/callback` and
    `https://your-domain.com/auth/callback` explicitly (or `/**` to allow all
    paths on those hosts).
- Keep email confirmation **disabled** (Supabase → Authentication → Sign In /
  Up → “Confirm email”). The intended flow is: signup → authenticated session
  returned immediately → redirect to `/dashboard`. No email is required.

**6. Test**
- Sign up with a brand-new email → you land straight on `/dashboard` with an
  authenticated session. No confirmation email, no waiting screen.
- Request a password reset → branded reset email → you can set a new password.
- Check Supabase Auth logs (Authentication → Logs) that password reset /
  email-change were handed off to the configured SMTP provider, and check the
  Resend dashboard for **Sent / Delivered** with no bounce/complaint.
- The final check: the inbox **From** must show **TenPoint** (from your verified
  address), not `Supabase Auth`. If it still shows "Supabase Auth", custom SMTP
  is not fully applied.

> **Production readiness note:** branded delivery cannot be claimed complete
> until the domain is Verified in Resend, Supabase Custom SMTP is saved, and a
> real branded email is received and confirmed. That requires dashboard/DNS
> access; it is done in the project dashboard, not by the application code.



## Testing

Pure-function tests cover:

- `scoring` — contributions, snapshots, historical immutability, 0–10 clamping.
- `timezone` — local-day derivation, **DST spring-forward/fall-back**, and
  half-hour/45-minute offsets (e.g. Asia/Kolkata, Australia/Lord_Howe).
- `historical` — recorded snapshots survive config changes; tasks never
  contaminate past ratings; over-configuration is surfaced but never rescaled.
- `rate-limit` — fixed-window allowance, rejection beyond limit, window reset,
  per-key isolation, and IP extraction.
- `auth` — signup response shape (session → instant `ok`, no confirmation
  mapping), signup error mapping, reset-password redirect, callback safe-`next`
  validation, and generic (non-enumerating) auth error mapping. These are
  handler-level tests that mock the Supabase server client; they do **not** send
  real email.

> **Not covered by CI here:** flows that require a live Supabase/Postgres, such
> as real sign-up/login, RLS isolation between two users, and the data-layer
> write/read round-trips. Scaffolding for the RLS isolation check ships in
> `tests/integration/rls-isolation.test.ts` (auto-skipped without
> `TENTEST_*` env vars). Point it at a provisioned project to run it before
> release.

## Deployment

Point the runtime at the Supabase project via the env vars above, run
`npm run build` and `npm start` (or deploy the Next.js app to any Node host /
Vercel). No `DATABASE_URL` is needed — the app talks to Postgres through
Supabase's PostgREST/RLS stack using the user session.

## Known limitations

- In-memory rate limiter (single instance) — swap for Redis for horizontal
  scale (see above).
- No automated integration tests without a live Supabase project yet.
