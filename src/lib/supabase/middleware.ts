import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session and enforces route-level access control.
 *
 * @param request - The incoming Next.js request.
 * @param nonce - Optional CSP nonce. When provided, the `x-nonce` header is
 *   forwarded on the request so that server components can read it via `headers()`.
 */
export async function updateSession(request: NextRequest, nonce?: string) {
  /**
   * Build forwarded request headers. We copy the current request headers
   * (including any cookies set earlier) and optionally add the CSP nonce.
   */
  function buildForwardedHeaders(): Headers {
    const h = new Headers(request.headers);
    if (nonce) h.set("x-nonce", nonce);
    return h;
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: buildForwardedHeaders() },
  });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Re-create response with updated cookies AND x-nonce header
          supabaseResponse = NextResponse.next({
            request: { headers: buildForwardedHeaders() },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth session to keep it alive.
  // IMPORTANT: Do not remove this line. Auth will break without it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicRoutes = ["/login", "/signup", "/auth/callback", "/auth/confirmed"];
  // Auth callback routes that authenticated users should NOT be redirected away from
  const authCallbackRoutes = ["/auth/callback", "/auth/confirmed"];
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) =>
    pathname === route || pathname.startsWith(route + "/")
  );

  // Redirect unauthenticated users to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages (except callback routes)
  const isAuthCallback = authCallbackRoutes.some((route) =>
    pathname === route || pathname.startsWith(route + "/")
  );
  if (user && isPublicRoute && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
