// ---------------------------------------------------------------------------
// Offline write queue — checking items off a shopping list in a grocery
// store with no reception is the app's core offline use case. When a list
// toggle fails while offline, the optimistic state is kept and the write is
// queued here (persisted in localStorage), then replayed when the browser
// comes back online.
// ---------------------------------------------------------------------------

export const QUEUE_KEY = "cooksnap-offline-queue";

export interface QueuedWrite {
  kind: "shopping-toggle" | "grocery-toggle";
  id: string;
  checked: boolean;
}

function readQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is QueuedWrite =>
        !!w &&
        typeof w === "object" &&
        typeof (w as QueuedWrite).id === "string" &&
        typeof (w as QueuedWrite).checked === "boolean" &&
        ((w as QueuedWrite).kind === "shopping-toggle" ||
          (w as QueuedWrite).kind === "grocery-toggle")
    );
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedWrite[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Storage unavailable — the optimistic state still shows; the write is lost.
  }
}

/** Current queue contents (read-only view for tests/UI). */
export function peekQueue(): QueuedWrite[] {
  return readQueue();
}

/**
 * Add a write to the queue. Rapid re-toggles of the same item collapse to
 * the latest state — replaying intermediate flips would be wasted requests.
 */
export function enqueueWrite(write: QueuedWrite): void {
  const queue = readQueue().filter(
    (w) => !(w.kind === write.kind && w.id === write.id)
  );
  queue.push(write);
  writeQueue(queue);
}

/**
 * Replay queued writes through the handler. Writes that fail stay queued
 * for the next flush; successful ones are removed.
 */
export async function flushQueue(
  handler: (write: QueuedWrite) => Promise<void>
): Promise<{ flushed: number; failed: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  const remaining: QueuedWrite[] = [];
  let flushed = 0;

  for (const write of queue) {
    try {
      await handler(write);
      flushed++;
    } catch {
      remaining.push(write);
    }
  }

  writeQueue(remaining);
  return { flushed, failed: remaining.length };
}
