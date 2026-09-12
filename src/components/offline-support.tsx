"use client";

import { useEffect } from "react";

/**
 * Offline bootstrap: registers the service worker (production only — the SW
 * would fight HMR in dev).
 *
 * Replaying queued offline writes is gone: Convex holds writes in its own
 * client queue and flushes them when the WebSocket reconnects.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("Service worker registration failed:", e);
      });
    }
  }, []);

  return null;
}
