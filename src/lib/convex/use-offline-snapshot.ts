"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvex } from "convex/react";

/**
 * Prefix chosen so `ClearOnSignOut` (see
 * `src/components/convex-client-provider.tsx`), which sweeps every
 * localStorage key starting with `cooksnap`, wipes snapshots on sign-out.
 *
 * The Clerk user id goes in the key as well: two accounts on one device share
 * a localStorage origin, and without it the second one reads the first one's
 * shopping list offline. A null id (signed out, or Clerk still loading) means
 * no key at all — neither read nor write.
 */
const PREFIX = "cooksnap:snapshot:";

function readSnapshot<T>(storageKey: string | null): T | undefined {
  if (storageKey === null || typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    /* unavailable or corrupt storage — fall back to the live query */
    return undefined;
  }
}

/**
 * Mirrors a live Convex query into localStorage and serves the last saved copy
 * while the socket is down and the query has nothing to give.
 *
 * `offline` means the saved copy is selected because the socket is down and
 * live data is undefined. Live data always wins over the snapshot.
 * `disconnected` means the socket is down, even when live data remains in memory.
 * Callers use it to show the banner and disable mutating controls.
 */
export function useOfflineSnapshot<T>(
  key: string,
  live: T | undefined,
): { data: T | undefined; offline: boolean; disconnected: boolean } {
  const convex = useConvex();
  const { userId } = useAuth();
  const storageKey = userId ? `${PREFIX}${userId}:${key}` : null;
  const [connected, setConnected] = useState(true);

  // Read during render rather than in an effect: the first paint that could
  // need the snapshot must already have it, and an effect here would both
  // render once without it and trip react-hooks/set-state-in-effect. Nothing
  // renders from it on the first pass (`connected` starts true), so this
  // cannot diverge from the server render.
  const [stored, setStored] = useState<{ key: string | null; value: T | undefined }>(() => ({
    key: storageKey,
    value: readSnapshot<T>(storageKey),
  }));
  if (stored.key !== storageKey) setStored({ key: storageKey, value: readSnapshot<T>(storageKey) });

  useEffect(() => {
    if (storageKey === null || live === undefined) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(live));
    } catch {
      /* quota exceeded or storage blocked — the snapshot is best effort */
    }
  }, [storageKey, live]);

  useEffect(() => {
    const read = () => setConnected(convex.connectionState().isWebSocketConnected);
    read();
    const id = window.setInterval(read, 2000);
    return () => window.clearInterval(id);
  }, [convex]);

  const offline = !connected && live === undefined;
  const disconnected = !connected;
  return { data: live ?? (offline ? stored.value : undefined), offline, disconnected };
}
