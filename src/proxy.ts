import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

const WORKSPACE_ROUTES = [
  "/dashboard",
  "/habits",
  "/tasks",
  "/calendar",
  "/timer",
  "/stats",
  "/settings",
];

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

function isWorkspacePath(pathname: string) {
  return WORKSPACE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isAuthPath(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Session-refresh + route-guard proxy (Next.js 16 proxy convention, formerly
 * middleware.ts).
 *
 * This is the FIRST line of defence for protected routes: an unauthenticated
 * visitor is redirected to /login before any page renders. The server
 * components and API routes under the hood ALSO validate the session via the
 * SSR Supabase client — the proxy never replaces that, it just avoids
 * rendering work for known-guest requests and keeps the auth cookie fresh.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    if (!user && isWorkspacePath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (user && isAuthPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/habits/:path*",
    "/tasks/:path*",
    "/calendar/:path*",
    "/timer/:path*",
    "/stats/:path*",
    "/settings/:path*",
    "/login/:path*",
    "/signup/:path*",
    "/forgot-password/:path*",
    "/reset-password/:path*",
  ],
};
