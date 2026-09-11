/**
 * Shown above a list that is rendering the localStorage snapshot from
 * `useOfflineSnapshot` because the Convex socket is down.
 */
export function OfflineBanner() {
  return (
    <p role="status" className="mb-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      Offline, showing your saved copy. Changes are disabled until you reconnect.
    </p>
  );
}
