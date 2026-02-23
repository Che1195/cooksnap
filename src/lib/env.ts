/**
 * Environment variable validation using Zod.
 *
 * - `clientEnv` validates NEXT_PUBLIC_ vars available in both server and browser.
 * - `serverEnv` validates all vars including secrets (server-side only).
 *
 * Import `clientEnv` in client components and `serverEnv` in server-only code.
 */
import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = clientSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/** Validated NEXT_PUBLIC_ env vars — safe to use in both server and client. */
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

let _cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/** Validated env vars including secrets — server-side only. */
export function getServerEnv(): z.infer<typeof serverSchema> {
  if (!_cachedServerEnv) {
    _cachedServerEnv = serverSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }
  return _cachedServerEnv;
}
