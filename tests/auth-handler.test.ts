import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase server client so these handler-level tests never touch a
// real project or send real email. The mocks are hoisted to keep vitest's
// module-mock hoisting happy.
const { signUpMock, exchangeMock, signInMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
  exchangeMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      signUp: signUpMock,
      exchangeCodeForSession: exchangeMock,
      signInWithPassword: signInMock,
    },
  })),
}));

import { POST as signupPost } from "@/app/api/auth/signup/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as callbackGet } from "@/app/auth/callback/route";

function req(url: string, ip = "10.0.0.1"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    ...(url.includes("api")
      ? { body: JSON.stringify({}) }
      : {}),
  });
}

describe("signup route with email confirmation disabled", () => {
  beforeEach(() => {
    signUpMock.mockReset();
  });

  function signupRequest(overrides: Record<string, unknown> = {}, ip = "10.0.0.1"): Request {
    return new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        name: "Alex Morgan",
        email: "Alex@Example.com",
        password: "correct-horse-battery",
        confirmPassword: "correct-horse-battery",
        ...overrides,
      }),
    });
  }

  it("returns ok with a session (no confirmation-waiting screen)", async () => {
    signUpMock.mockResolvedValue({ data: { session: {}, user: { id: "u1" } }, error: null });
    const res = await signupPost(signupRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    // The name must still travel in the signup payload for trigger-based
    // profile/display-name creation.
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: { data: { name: "Alex Morgan" } } }),
    );
  });

  it("maps an existing-account error to a neutral alreadyExists response", async () => {
    signUpMock.mockResolvedValue({ data: null, error: new Error("User already registered") });
    const res = await signupPost(signupRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyExists: true });
  });

  it("returns a generic error when signUp fails without leaking the provider message", async () => {
    signUpMock.mockResolvedValue({ data: null, error: new Error("password_too_short") });
    const res = await signupPost(signupRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Could not create your account");
    expect(JSON.stringify(body)).not.toContain("password_too_short");
  });

  it("returns a generic error when no session is returned (unexpected with confirmation off)", async () => {
    signUpMock.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    const res = await signupPost(signupRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Could not create your account." });
  });

  it("rejects invalid input before calling Supabase", async () => {
    const res = await signupPost(signupRequest({ name: "A" }));
    expect(res.status).toBe(400);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated signups per IP", async () => {
    signUpMock.mockResolvedValue({ data: { session: {} }, error: null });
    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      lastStatus = (await signupPost(signupRequest({ email: `user${i}@example.com` }, "77.77.77.7"))).status;
    }
    // Allowed = 10; the 11th must be rejected with 429.
    expect(lastStatus).toBe(429);
  });
});

describe("login auth-error mapping", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("returns a single generic 401 for both unknown account and wrong password", async () => {
    signInMock.mockResolvedValue({ data: { session: null }, error: new Error("invalid_credentials") });
    const r = req("http://localhost:3000/api/auth/login");
    const res = await loginPost(r);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("incorrect");
    // Must not echo the underlying Supabase error string (no leakage).
    expect(JSON.stringify(body)).not.toContain("invalid_credentials");
  });
});

describe("callback safe-next validation", () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    exchangeMock.mockResolvedValue({ data: null, error: null });
  });

  async function locationFor(next?: string): Promise<string | null> {
    const q = next === undefined ? "" : `&next=${encodeURIComponent(next)}`;
    const r = new Request(`http://localhost:3000/auth/callback?code=abc123${q}`);
    const res = await callbackGet(r);
    return res.headers.get("location");
  }

  it("redirects to the dashboard by default after a successful code exchange", async () => {
    expect(await locationFor()).toContain("http://localhost:3000/dashboard");
  });

  it("allows only safe internal next paths", async () => {
    expect(await locationFor("/settings")).toContain("http://localhost:3000/settings");
    expect(await locationFor("/habits/prayer")).toContain("http://localhost:3000/habits/prayer");
  });

  it("blocks open-redirect attempts (absolute and protocol-relative URLs)", async () => {
    // Absolute URL and protocol-relative URL both fall back to /dashboard.
    expect(await locationFor("https://evil.example.com")).toContain("/dashboard");
    expect(await locationFor("//evil.example.com")).toContain("/dashboard");
    // A malformed path starting mid-string also falls back safely.
    expect(await locationFor("\\evil")).toContain("/dashboard");
  });

  it("redirects recovery requests to /reset-password regardless of next", async () => {
    const r = new Request(
      "http://localhost:3000/auth/callback?code=recover123&type=recovery&next=%2Fdashboard",
    );
    const res = await callbackGet(r);
    expect(res.headers.get("location")).toContain("http://localhost:3000/reset-password");
  });

  it("redirects to /login when there is no usable code and it is not a recovery", async () => {
    exchangeMock.mockResolvedValue({ data: null, error: new Error("invalid code") });
    const r = new Request("http://localhost:3000/auth/callback?code=bogus");
    const res = await callbackGet(r);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("http://localhost:3000/login");
  });
});
