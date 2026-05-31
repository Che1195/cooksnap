import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

describe("env validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not validate missing Supabase env vars during module import", async () => {
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }

    await expect(import("./env")).resolves.toBeTruthy();
  });

  it("validates client env when requested", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    const { getClientEnv } = await import("./env");

    expect(getClientEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    });
  });

  it("throws a clear validation error when client env is requested but missing", async () => {
    for (const key of ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }

    const { getClientEnv } = await import("./env");

    expect(() => getClientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
