import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueWrite,
  peekQueue,
  flushQueue,
  QUEUE_KEY,
} from "./offline-queue";

beforeEach(() => {
  localStorage.removeItem(QUEUE_KEY);
});

describe("enqueueWrite", () => {
  it("appends writes to the persisted queue", () => {
    enqueueWrite({ kind: "shopping-toggle", id: "s1", checked: true });
    enqueueWrite({ kind: "grocery-toggle", id: "g1", checked: false });

    const queue = peekQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ kind: "shopping-toggle", id: "s1", checked: true });
  });

  it("keeps only the latest write per item (rapid re-toggles collapse)", () => {
    enqueueWrite({ kind: "shopping-toggle", id: "s1", checked: true });
    enqueueWrite({ kind: "shopping-toggle", id: "s1", checked: false });

    const queue = peekQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].checked).toBe(false);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(QUEUE_KEY, "not-json{{{");
    enqueueWrite({ kind: "shopping-toggle", id: "s1", checked: true });
    expect(peekQueue()).toHaveLength(1);
  });
});

describe("flushQueue", () => {
  it("processes all writes and empties the queue", async () => {
    enqueueWrite({ kind: "shopping-toggle", id: "s1", checked: true });
    enqueueWrite({ kind: "grocery-toggle", id: "g1", checked: true });

    const handler = vi.fn().mockResolvedValue(undefined);
    const result = await flushQueue(handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.flushed).toBe(2);
    expect(result.failed).toBe(0);
    expect(peekQueue()).toHaveLength(0);
  });

  it("keeps failed writes queued for the next flush", async () => {
    enqueueWrite({ kind: "shopping-toggle", id: "ok", checked: true });
    enqueueWrite({ kind: "shopping-toggle", id: "bad", checked: true });

    const handler = vi.fn().mockImplementation(async (w: { id: string }) => {
      if (w.id === "bad") throw new Error("still offline");
    });
    const result = await flushQueue(handler);

    expect(result.flushed).toBe(1);
    expect(result.failed).toBe(1);
    expect(peekQueue()).toHaveLength(1);
    expect(peekQueue()[0].id).toBe("bad");
  });

  it("is a no-op on an empty queue", async () => {
    const handler = vi.fn();
    const result = await flushQueue(handler);
    expect(handler).not.toHaveBeenCalled();
    expect(result.flushed).toBe(0);
  });
});
