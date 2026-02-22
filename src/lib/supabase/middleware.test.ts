/**
 * Tests for the Supabase auth middleware (src/lib/supabase/middleware.ts).
 *
 * Verifies route protection: unauthenticated users get redirected to /login,
 * authenticated users get redirected away from auth pages, and public routes
 * are accessible without a session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @supabase/ssr before importing the module under test
// ---------------------------------------------------------------------------

let mockUser: { id: string } | null = { id: "user-123" };

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

function createMockRequest(pathname: string) {
  const cookies = new Map<string, string>();

  return {
    cookies: {
      getAll: () => Array.from(cookies.entries()).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => cookies.set(name, value),
    },
    nextUrl: {
      pathname,
      clone: () => ({
        pathname,
        toString: () => `http://localhost:3000${pathname}`,
      }),
    },
  } as any;
}

// Mock NextResponse
const mockRedirect = vi.fn((url: any) => ({
  type: "redirect",
  url,
  cookies: { set: vi.fn() },
}));

const mockNext = vi.fn((opts?: any) => ({
  type: "next",
  cookies: { set: vi.fn() },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: any[]) => mockRedirect(...args),
    next: (...args: any[]) => mockNext(...args),
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
    const response = await updateSession(request);

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
    const response = await updateSession(request);

    // Should NOT redirect — returns the "next" response
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unauthenticated user to access /signup", async () => {
    const request = createMockRequest("/signup");
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
