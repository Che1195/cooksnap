import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackButton } from "./feedback-button";

const { createIssue } = vi.hoisted(() => ({ createIssue: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/issues" }));
vi.mock("@/lib/convex/use-issues", () => ({ useIssueActions: () => ({ createIssue }) }));
afterEach(cleanup);
beforeEach(() => { createIssue.mockReset(); });

describe("FeedbackButton", () => {
  it("opens a named modal, moves focus inside, and restores the trigger after Escape", async () => {
    render(<FeedbackButton />);
    const trigger = screen.getByRole("button", { name: "Feedback" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Send feedback" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getByLabelText("Description")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
  it("keeps pending submissions open and closes the receipt link even on /issues", async () => {
    let resolve: (() => void) | undefined;
    createIssue.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    render(<FeedbackButton />);
    const trigger = screen.getByRole("button", { name: "Feedback" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Fix recipe search" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(createIssue).toHaveBeenCalledTimes(1);
    resolve?.();
    const link = await screen.findByRole("link", { name: "View feedback and status" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

});
