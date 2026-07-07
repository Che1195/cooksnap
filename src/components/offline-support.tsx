"use client";

import { useEffect } from "react";
import { useRecipeStore } from "@/stores/recipe-store";

/**
 * Offline bootstrap: registers the service worker (production only — the SW
 * would fight HMR in dev) and replays queued offline writes when the browser
 * comes back online or the app relaunches.
 */
export function OfflineSupport() {
  const flushOfflineWrites = useRecipeStore((s) => s.flushOfflineWrites);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("Service worker registration failed:", e);
      });
    }

    const flush = () => {
      void flushOfflineWrites().catch((e) => {
        console.error("Offline queue flush failed:", e);
      });
    };

    window.addEventListener("online", flush);
    // Replay anything left over from a previous offline session
    flush();
    return () => window.removeEventListener("online", flush);
  }, [flushOfflineWrites]);

  return null;
}
