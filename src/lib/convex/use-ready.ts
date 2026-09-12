"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Whether protected Convex queries may run.
 *
 * Every read hook in this directory calls a query whose handler starts with
 * `requireUser`, which throws `Unauthenticated` before Clerk has a token and
 * `User not provisioned` in the window between the first sign-in and
 * `users.ensure` landing. Convex's `useQuery` rethrows those during render, so
 * a hook mounted outside an error boundary — `BottomNav` lives in the root
 * layout — would blank the whole app on `/login`, `/signup` and right after
 * sign-out.
 *
 * `api.users.current` is the one safe probe: it returns `null` while signed
 * out or unprovisioned and never throws. Hooks pass `"skip"` until this is
 * true, so they resolve to `undefined` (their existing loading value) instead.
 */
export function useConvexReady(): boolean {
  const { isAuthenticated } = useConvexAuth();
  const current = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  return isAuthenticated && current != null;
}
