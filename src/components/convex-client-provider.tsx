"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useRecipeStore } from "@/stores/recipe-store";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
const convex = new ConvexReactClient(url);

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  useEffect(() => {
    if (isAuthenticated) void ensure({});
  }, [isAuthenticated, ensure]);
  return null;
}

/**
 * Wipes client-side state on the signed-in -> signed-out edge.
 *
 * The store is persisted, so without this a second account signing in on the
 * same device can briefly render the previous account's recipes while the
 * fresh data loads. This replaces the centralized clear that used to live in
 * the Supabase AuthProvider's `onAuthStateChange` SIGNED_OUT branch, and it
 * covers sign-outs this tab never initiated (another tab, or a revoked
 * session). Task 8 must keep this behaviour when it rewrites the store.
 */
function ClearOnSignOut() {
  const { isSignedIn } = useAuth();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    // Only act on the true -> false transition. `isSignedIn` is `undefined`
    // until Clerk loads, so an initial render must not count as a sign-out.
    if (wasSignedIn.current && isSignedIn === false) {
      useRecipeStore.getState().clear();
      try {
        const stale: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("cooksnap")) stale.push(key);
        }
        // Collected first: removing during iteration reindexes the keys.
        for (const key of stale) localStorage.removeItem(key);
      } catch {
        // Storage can be unavailable (private mode, blocked cookies). The
        // in-memory clear above is the part that matters for the flash.
      }
    }
    if (isSignedIn !== undefined) wasSignedIn.current = isSignedIn;
  }, [isSignedIn]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <EnsureUser />
      <ClearOnSignOut />
      {children}
    </ConvexProviderWithClerk>
  );
}
