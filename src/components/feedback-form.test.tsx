import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";

const { createIssue } = vi.hoisted(() => ({ createIssue: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/recipes/123?private=secret#fragment" }));
vi.mock("@/lib/convex/use-issues", () => ({ useIssueActions: () => ({ createIssue }) }));
afterEach(cleanup);
beforeEach(() => { createIssue.mockReset(); });

describe("FeedbackForm", () => {
  it("saves feature requests with a derived title and pathname, then shows an accurate receipt", async () => {
    createIssue.mockResolvedValue(undefined);
    render(<FeedbackForm />);
    fireEvent.click(screen.getByLabelText("Request a feature"));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "  Add recipe scaling\nFor larger dinners  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Feature request saved to CookSnap.");
    expect(createIssue).toHaveBeenCalledWith({ kind: "feature", title: "Add recipe scaling", description: "Add recipe scaling\nFor larger dinners", pageUrl: "/recipes/123", severity: "medium" });
    expect(screen.getByRole("link", { name: "View feedback and status" }).getAttribute("href")).toBe("/issues");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("");
  });

  it("retains the draft after failure and allows retry", async () => {
    createIssue.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(undefined);
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Search does not find my recipe" } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Search does not find my recipe");
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Issue report saved to CookSnap.");
    expect(createIssue).toHaveBeenCalledTimes(2);
  });

  it("focuses invalid descriptions and never submits whitespace or oversized text", () => {
    render(<FeedbackForm />);
    for (const value of ["   ", "x".repeat(2001)]) {
      fireEvent.change(screen.getByLabelText("Description"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
      expect(document.activeElement).toBe(screen.getByLabelText("Description"));
      expect(screen.getByLabelText("Description").getAttribute("aria-invalid")).toBe("true");
    }
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("blocks duplicate form submissions while a request is pending", async () => {
    let resolve: (() => void) | undefined;
    createIssue.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A problem" } });
    const form = screen.getByRole("button", { name: "Send feedback" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(createIssue).toHaveBeenCalledTimes(1);
    resolve?.();
    await waitFor(() => expect(screen.queryByText("Sending feedback…")).toBeNull());
  });
});
