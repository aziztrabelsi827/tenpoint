import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase server client so these handler-level tests never touch a
// real project or send real email. The mocks are hoisted to keep vitest's
// module-mock hoisting happy.
const { resendMock, exchangeMock, signInMock } = vi.hoisted(() => ({
  resendMock: vi.fn(),
  exchangeMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: {
      resend: resendMock,
      exchangeCodeForSession: exchangeMock,
      signInWithPassword: signInMock,
    },
  })),
}));

import { POST as resendPost } from "@/app/api/auth/resend/route";
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

describe("resend confirmation route", () => {
  beforeEach(() => {
    resendMock.mockReset();
    resendMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for an invalid email without calling Supabase", async () => {
    const r = new Request("http://localhost:3000/api/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await resendPost(r);
    expect(res.status).toBe(400);
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("delegates to supabase.auth.resend with type signup and a redirect URL", async () => {
    const r = new Request("http://localhost:3000/api/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "Art@Example.com " }),
    });
    const res = await resendPost(r);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "art@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });
  });

  it("returns a generic ok even when the provider errors (no enumeration)", async () => {
    resendMock.mockResolvedValue({ error: new Error("over_email_send_rate_limit") });
    const r = new Request("http://localhost:3000/api/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.org" }),
    });
    const res = await resendPost(r);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rate-limits repeated resend requests per IP", async () => {
    const ipOne = "99.99.99.1";
    const body = JSON.stringify({ email: "rate@example.com" });
    let lastStatus = 0;
    for (let i = 0; i < 4; i += 1) {
      const r = new Request("http://localhost:3000/api/auth/resend", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ipOne },
        body,
      });
      lastStatus = (await resendPost(r)).status;
    }
    // Allowed = 3; the 4th must be rejected with 429.
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
