import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UrlInput } from "./url-input";
import type { Profile, RecipeCaptureResult } from "@/types";

const state = vi.hoisted(() => ({
  profile: undefined as Profile | null | undefined,
  add: vi.fn(),
}));
vi.mock("@/lib/convex/use-user", () => ({
  useCurrentUser: () => ({ profile: state.profile }),
}));
vi.mock("@/lib/convex/use-recipes", () => ({
  useRecipeActions: () => ({ addRecipe: state.add }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const profile: Profile = {
  id: "alice",
  email: null,
  displayName: null,
  avatarUrl: null,
  createdAt: "",
  updatedAt: "",
  reviewBeforeSaving: true,
};
const draft: RecipeCaptureResult = {
  title: "Soup",
  image: null,
  ingredients: ["1 cup rice"],
  instructions: ["Boil rice."],
  importId: "server-id",
  needsReview: false,
  warnings: [],
};
function start() {
  fireEvent.change(screen.getByLabelText("Recipe URL"), {
    target: { value: "example.com/recipe" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Snap recipe" }));
}
beforeEach(() => {
  state.profile = profile;
  state.add.mockReset().mockResolvedValue("recipe-id");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => draft }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("recipe capture review", () => {
  it("does not write before confirmation and saves edits with the capture attempt key", async () => {
    render(<UrlInput />);
    start();
    await screen.findByRole("heading", { name: "Review recipe" });
    expect(state.add).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Review recipe" }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Rice soup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(state.add).toHaveBeenCalledTimes(1));
    const request = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    ) as { importId: string };
    expect(state.add.mock.calls[0][0].title).toBe("Rice soup");
    expect(state.add.mock.calls[0][2]).toBe(request.importId);
  });
  it("cancels without writes and restores URL focus", async () => {
    render(<UrlInput />);
    start();
    await screen.findByRole("heading", { name: "Review recipe" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Recipe URL")),
    );
    expect(state.add).not.toHaveBeenCalled();
  });
  it("retains edited draft after failed save and retries without extraction", async () => {
    state.add.mockRejectedValueOnce(new Error("offline"));
    render(<UrlInput />);
    start();
    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Edited soup" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Edited soup",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(state.add).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.add.mock.calls[0][2]).toBe(state.add.mock.calls[1][2]);
  });
  it("auto-saves complete captures only when review was off at capture start", async () => {
    state.profile = { ...profile, reviewBeforeSaving: false };
    render(<UrlInput />);
    start();
    await waitFor(() => expect(state.add).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Review recipe" })).toBeNull();
  });
  it("forces repair despite opt-out and focuses missing content", async () => {
    state.profile = { ...profile, reviewBeforeSaving: false };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...draft, ingredients: [], needsReview: true }),
    } as Response);
    render(<UrlInput />);
    start();
    const reviewHeading = await screen.findByRole("heading", { name: "Review recipe" });
    await waitFor(() => expect(document.activeElement).toBe(reviewHeading));
    fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(state.add).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByLabelText("New ingredient"),
    );
    expect(screen.getByText("Add at least one ingredient.")).toBeTruthy();
  });
  it("shows flagged complete drafts for review despite opt-out", async () => {
    state.profile = { ...profile, reviewBeforeSaving: false };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...draft,
        needsReview: true,
        warnings: ["The page lists two different rice amounts."],
      }),
    } as Response);
    render(<UrlInput />);
    start();
    await screen.findByRole("heading", { name: "Review recipe" });
    expect(state.add).not.toHaveBeenCalled();
    expect(screen.getByText("Check the flagged details before saving.")).toBeTruthy();
    expect(screen.getByText("The page lists two different rice amounts.")).toBeTruthy();
  });
  it.each([undefined, null])(
    "waits for a provisioned profile: %s",
    (unresolved) => {
      state.profile = unresolved;
      render(<UrlInput />);
      start();
      expect(fetch).not.toHaveBeenCalled();
      expect(state.add).not.toHaveBeenCalled();
    },
  );
  it("ignores a cancelled response and blocks overlapping capture requests", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<UrlInput />);
    start();
    fireEvent.keyDown(screen.getByLabelText("Recipe URL"), { key: "Enter" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));
    await act(async () =>
      resolve({ ok: true, json: async () => draft } as Response),
    );
    expect(screen.queryByRole("heading", { name: "Review recipe" })).toBeNull();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("freezes review preference while capture is running", async () => {
    let resolve: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<UrlInput />);
    start();
    state.profile = { ...profile, reviewBeforeSaving: false };
    rerender(<UrlInput />);
    await act(async () =>
      resolve({ ok: true, json: async () => draft } as Response),
    );
    expect(screen.getByRole("heading", { name: "Review recipe" })).toBeTruthy();
    expect(state.add).not.toHaveBeenCalled();
  });
  it("AI failure exposes retry without source-only saving", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Interpretation unavailable. Try again." }),
    } as Response);
    render(<UrlInput />);
    start();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Save recipe" })).toBeNull();
    expect(state.add).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Snap recipe" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

it("requires a real ingredient rather than section headers before saving", async () => {
  state.profile = { ...profile, reviewBeforeSaving: false };
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ ...draft, ingredients: ["## Sauce"] }),
  } as Response);
  render(<UrlInput />);
  start();
  await screen.findByRole("heading", { name: "Review recipe" });
  fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
  expect(state.add).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByLabelText("New ingredient"));
});

it.each([
  { ...draft, ingredients: null },
  { ...draft, warnings: undefined },
  { ...draft, needsReview: "false" },
  { ...draft, image: "javascript:alert(1)" },
])(
  "rejects malformed API success payloads without rendering or saving",
  async (body) => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);
    render(<UrlInput />);
    start();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "incomplete or invalid",
    );
    expect(screen.queryByRole("heading", { name: "Review recipe" })).toBeNull();
    expect(state.add).not.toHaveBeenCalled();
  },
);

it("ignores capture responses after the active account changes", async () => {
  state.profile = { ...profile, reviewBeforeSaving: false };
  let resolve: (value: Response) => void = () => {};
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { rerender } = render(<UrlInput />);
  start();
  state.profile = { ...profile, id: "bob" };
  rerender(<UrlInput />);
  await act(async () =>
    resolve({ ok: true, json: async () => draft } as Response),
  );
  expect(state.add).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "Review recipe" })).toBeNull();
});

it("hides a reviewed draft after switching accounts so it cannot be saved", async () => {
  const { rerender } = render(<UrlInput />);
  start();
  await screen.findByRole("heading", { name: "Review recipe" });
  state.profile = { ...profile, id: "bob" };
  rerender(<UrlInput />);
  expect(screen.queryByRole("button", { name: "Save recipe" })).toBeNull();
  expect(state.add).not.toHaveBeenCalled();
});

it("focuses a save failure after the error renders", async () => {
  state.add.mockRejectedValueOnce(new Error("offline"));
  render(<UrlInput />);
  start();
  await screen.findByLabelText("Title");
  fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
  const alert = await screen.findByRole("alert");
  expect(document.activeElement).toBe(alert);
});

it("guards dirty drafts against page unload and removes the guard on explicit cancel", async () => {
  render(<UrlInput />);
  start();
  await screen.findByLabelText("Title");
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Changed soup" },
  });
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const cancelled = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cancelled);
  expect(cancelled.defaultPrevented).toBe(false);
  expect(state.add).not.toHaveBeenCalled();
});
