"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Mode = "login" | "signup" | "forgot-password" | "reset-password";

function AuthFormInner({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"" | "sent" | "rate-limited" | "failed">("");
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);

  const endpoint =
    mode === "forgot-password"
      ? "/api/auth/forgot-password"
      : mode === "reset-password"
        ? "/api/auth/reset-password"
        : `/api/auth/${mode}`;

  function clientValidate(): string | null {
    if (mode === "signup") {
      if (name.trim().length < 2) return "Please enter your name.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }
    if (mode === "login" || mode === "forgot-password") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        return "Enter a valid email address.";
      }
    }
    if (mode === "reset-password" || mode === "signup") {
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }
    return null;
  }

  async function resendConfirmation() {
    if (!confirmEmail) return;
    if (Date.now() < resendCooldownUntil) {
      setResendStatus("rate-limited");
      return;
    }
    setResending(true);
    setResendStatus("");
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: confirmEmail }),
      });
      if (res.status === 429) {
        setResendStatus("rate-limited");
      } else {
        setResendStatus(res.ok ? "sent" : "failed");
        if (res.ok) {
          // Server allows a few requests/minute; enforce a client cooldown so
          // we never hammer the endpoint or exhaust the mailer quota.
          setResendCooldownUntil(Date.now() + 20_000);
        }
      }
    } catch {
      setResendStatus("failed");
    }
    setResending(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const invalid = clientValidate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    try {
      const payload =
        mode === "login"
          ? { email, password, keepLoggedIn }
          : mode === "signup"
            ? { name, email, password, confirmPassword }
            : mode === "forgot-password"
              ? { email }
              : { password, confirmPassword };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; needsConfirmation?: boolean; alreadyExists?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (mode === "login") {
        router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
        router.refresh();
        return;
      }

      if (mode === "signup") {
        if (data.needsConfirmation) {
          setNotice("Check your email to confirm your account. You can log in once it’s confirmed.");
          setConfirmEmail(email.trim().toLowerCase());
          setNeedsConfirmation(true);
        } else if (data.alreadyExists) {
          setNotice("An account with that email may already exist. Try logging in, or reset your password.");
        } else {
          router.push("/dashboard");
          router.refresh();
        }
        setLoading(false);
        return;
      }

      if (mode === "forgot-password") {
        setNotice("If an account exists for that email, we've sent a password reset link.");
        setLoading(false);
        return;
      }

      if (mode === "reset-password") {
        setNotice("Your password has been updated. You can log in now.");
        setTimeout(() => {
          router.push("/login");
          router.refresh();
        }, 900);
        setLoading(false);
        return;
      }
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  const heading = {
    login: "Welcome back",
    signup: "Create your account",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
  }[mode];

  return (
    <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8" noValidate>
      <h1 className="text-2xl font-bold">{heading}</h1>
      <p className="mt-1.5 text-sm" style={{ color: "var(--fg-muted)" }}>
        {mode === "login" && "Log in to pick up your streak where you left it."}
        {mode === "signup" && "Your workspace is private — habits, tasks, calendar and history are yours alone."}
        {mode === "forgot-password" && "Enter your email and we'll send you a link to reset your password."}
        {mode === "reset-password" && "Enter a new password for your account."}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {mode === "signup" ? (
          <div>
            <label className="field-label" htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              value={name}
              autoComplete="name"
              required
              minLength={2}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Morgan"
            />
          </div>
        ) : null}

        {mode === "login" || mode === "signup" || mode === "forgot-password" ? (
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus={mode === "forgot-password"}
            />
          </div>
        ) : null}

        {mode === "login" || mode === "signup" || mode === "reset-password" ? (
          <div>
            <label className="field-label" htmlFor="password">
              {mode === "signup" || mode === "reset-password" ? "New password" : "Password"}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input pr-12"
                value={password}
                autoComplete={mode === "signup" || mode === "reset-password" ? "new-password" : "current-password"}
                required
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" || mode === "reset-password" ? "At least 8 characters" : "••••••••"}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold"
                style={{ color: "var(--fg-muted)" }}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "signup" || mode === "reset-password" ? (
          <div>
            <label className="field-label" htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              className="input"
              value={confirmPassword}
              autoComplete="new-password"
              required
              minLength={8}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
            />
          </div>
        ) : null}

        {mode === "login" ? (
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
              />
              Keep me logged in
            </label>
            <Link href="/forgot-password" className="text-sm font-semibold hover:underline" style={{ color: "var(--primary)" }}>
              Forgot password?
            </Link>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-semibold" style={{ color: "var(--danger)" }}>{error}</p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm font-semibold" style={{ color: "var(--positive)" }}>{notice}</p>
        ) : null}

        {mode === "signup" && needsConfirmation ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-ghost w-full"
              disabled={resending}
              onClick={resendConfirmation}
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </button>
            {resendStatus === "sent" ? (
              <p role="status" className="text-center text-xs font-semibold" style={{ color: "var(--positive)" }}>
                Confirmation email sent. Check your inbox (and spam) for the link.
              </p>
            ) : resendStatus === "rate-limited" ? (
              <p role="alert" className="text-center text-xs font-semibold" style={{ color: "var(--danger)" }}>
                Please wait a little before requesting another email.
              </p>
            ) : resendStatus === "failed" ? (
              <p role="alert" className="text-center text-xs font-semibold" style={{ color: "var(--danger)" }}>
                Could not resend right now. Please try again shortly.
              </p>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Log in"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot-password"
                  ? "Send reset link"
                  : "Update password"}
        </button>
      </div>

      <p className="mt-5 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
        {mode === "signup" ? (
          <>Already have an account?{" "}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>Log in</Link>
          </>
        ) : mode === "login" ? (
          <>New here?{" "}
            <Link href="/signup" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>Create a free account</Link>
          </>
        ) : (
          <>Remembered it?{" "}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: "var(--primary)" }}>Log in</Link>
          </>
        )}
      </p>
    </form>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={<div className="card w-full max-w-md p-6 text-sm">Loading…</div>}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
