"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";

/**
 * Prefix chosen so `ClearOnSignOut` (see
 * `src/components/convex-client-provider.tsx`), which sweeps every
 * localStorage key starting with `cooksnap`, wipes snapshots on sign-out.
 */
const PREFIX = "cooksnap:snapshot:";

function readSnapshot<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
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
 * `offline` is true only when both hold, so a reconnect or a first successful
 * load always wins over the snapshot. Callers use it to show
 * `<OfflineBanner />` and disable mutating controls.
 */
export function useOfflineSnapshot<T>(
  key: string,
  live: T | undefined,
): { data: T | undefined; offline: boolean } {
  const convex = useConvex();
  const [connected, setConnected] = useState(true);

  // Read during render rather than in an effect: the first paint that could
  // need the snapshot must already have it, and an effect here would both
  // render once without it and trip react-hooks/set-state-in-effect. Nothing
  // renders from it on the first pass (`connected` starts true), so this
  // cannot diverge from the server render.
  const [stored, setStored] = useState<{ key: string; value: T | undefined }>(() => ({
    key,
    value: readSnapshot<T>(key),
  }));
  if (stored.key !== key) setStored({ key, value: readSnapshot<T>(key) });

  useEffect(() => {
    if (live === undefined) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(live));
    } catch {
      /* quota exceeded or storage blocked — the snapshot is best effort */
    }
  }, [key, live]);

  useEffect(() => {
    const read = () => setConnected(convex.connectionState().isWebSocketConnected);
    read();
    const id = window.setInterval(read, 2000);
    return () => window.clearInterval(id);
  }, [convex]);

  const offline = !connected && live === undefined;
  return { data: live ?? (offline ? stored.value : undefined), offline };
}
