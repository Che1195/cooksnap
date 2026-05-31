/**
 * Tests for the Supabase auth middleware (src/lib/supabase/middleware.ts).
 *
 * Verifies route protection: unauthenticated users get redirected to /login,
 * authenticated users get redirected away from auth pages, and public routes
 * are accessible without a session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock @supabase/ssr before importing the module under test
// ---------------------------------------------------------------------------

let mockUser: { id: string } | null = { id: "user-123" };

vi.mock("@/lib/env", () => ({
  getClientEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: mockUser },
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Minimal NextRequest / NextResponse stubs
// ---------------------------------------------------------------------------

type MockRedirectUrl = { pathname: string; toString: () => string };
type MockNextOptions = { request?: { headers: Headers } };

function createMockRequest(pathname: string): NextRequest {
  const cookies = new Map<string, string>();

  return {
    cookies: {
      getAll: () => Array.from(cookies.entries()).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => cookies.set(name, value),
    },
    headers: new Headers(),
    nextUrl: {
      pathname,
      clone: () => ({
        pathname,
        toString: () => `http://localhost:3000${pathname}`,
      }),
    },
  } as unknown as NextRequest;
}

// Mock NextResponse
const mockRedirect = vi.fn((url: MockRedirectUrl) => ({
  type: "redirect",
  url,
  cookies: { set: vi.fn() },
}));

const mockNext = vi.fn((opts?: MockNextOptions) => {
  void opts;
  return {
    type: "next",
    cookies: { set: vi.fn() },
  };
});

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: [MockRedirectUrl]) => mockRedirect(...args),
    next: (...args: [MockNextOptions?]) => mockNext(...args),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { updateSession } from "./middleware";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUser = { id: "user-123" };
  mockRedirect.mockClear();
  mockNext.mockClear();
});

describe("Middleware – Unauthenticated users", () => {
  beforeEach(() => {
    mockUser = null;
  });

  it("redirects unauthenticated user from / to /login", async () => {
    const request = createMockRequest("/");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    const redirectUrl = mockRedirect.mock.calls[0][0];
    expect(redirectUrl.pathname).toBe("/login");
  });

  it("redirects unauthenticated user from /recipes to /login", async () => {
    const request = createMockRequest("/recipes");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0].pathname).toBe("/login");
  });

  it("redirects unauthenticated user from /meal-plan to /login", async () => {
    const request = createMockRequest("/meal-plan");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0].pathname).toBe("/login");
  });

  it("redirects unauthenticated user from /shopping-list to /login", async () => {
    const request = createMockRequest("/shopping-list");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0].pathname).toBe("/login");
  });

  it("allows unauthenticated user to access /login", async () => {
    const request = createMockRequest("/login");
    await updateSession(request);

    // Should NOT redirect — returns the "next" response
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unauthenticated user to access /signup", async () => {
    const request = createMockRequest("/signup");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unauthenticated API requests through so route handlers return JSON errors", async () => {
    const request = createMockRequest("/api/scrape");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unauthenticated user to access /auth/callback", async () => {
    const request = createMockRequest("/auth/callback");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("Middleware – Authenticated users", () => {
  it("allows authenticated user to access /", async () => {
    const request = createMockRequest("/");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows authenticated user to access /recipes", async () => {
    const request = createMockRequest("/recipes");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows authenticated user to access /recipes/some-id", async () => {
    const request = createMockRequest("/recipes/abc-123");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects authenticated user from /login to /", async () => {
    const request = createMockRequest("/login");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0].pathname).toBe("/");
  });

  it("redirects authenticated user from /signup to /", async () => {
    const request = createMockRequest("/signup");
    await updateSession(request);

    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0].pathname).toBe("/");
  });

  it("does NOT redirect authenticated user from /auth/callback", async () => {
    const request = createMockRequest("/auth/callback");
    await updateSession(request);

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
