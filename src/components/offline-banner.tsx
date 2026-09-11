/**
 * Shown while the Convex socket is down, with copy for saved or live data.
 */
export function OfflineBanner({ variant = "snapshot" }: { variant?: "snapshot" | "live" }) {
  return (
    <p role="status" className="mb-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      {variant === "snapshot"
        ? "Offline, showing your saved copy. Changes are disabled until you reconnect."
        : "Offline. Changes are disabled until you reconnect."}
    </p>
  );
}
