"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for throws in the root layout itself (`BottomNav`,
 * the Convex provider), which `app/error.tsx` cannot catch — without this a
 * root-layout throw renders a blank page. Next.js replaces the whole document
 * here, so this file must ship its own `<html>`/`<body>` and cannot rely on
 * the app's providers, fonts or Tailwind layer being mounted.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Something went wrong</h2>
        <p style={{ fontSize: "0.875rem", opacity: 0.7, margin: 0 }}>
          CookSnap could not load. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.5rem",
            border: "1px solid currentColor",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
