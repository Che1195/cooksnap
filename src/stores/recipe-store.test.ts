import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRecipeStore } from "./recipe-store";

// ---------------------------------------------------------------------------
// The store holds only cooking-session state now; all server data lives in
// Convex and is read through the hooks in src/lib/convex/.
// ---------------------------------------------------------------------------

const getState = () => useRecipeStore.getState();

beforeEach(() => {
  localStorage.removeItem("cooksnap:cooking");
  getState().clear();
});

describe("Store shape", () => {
  it("exposes no server-state fields", () => {
    const state = useRecipeStore.getState();
    expect("recipes" in state).toBe(false);
    expect("hydrate" in state).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cooking Mode
// ---------------------------------------------------------------------------

describe("Cooking Mode", () => {
  it("startCooking sets cookingRecipeId and resets completed steps", () => {
    getState().startCooking("recipe-1");

    expect(getState().cookingRecipeId).toBe("recipe-1");
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("stopCooking clears cookingRecipeId and completed steps", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);
    getState().toggleCookingStep(2);

    getState().stopCooking();

    expect(getState().cookingRecipeId).toBeNull();
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("toggleCookingStep adds and removes step indices", () => {
    getState().startCooking("recipe-1");

    getState().toggleCookingStep(0);
    expect(getState().cookingCompletedSteps).toEqual(new Set([0]));

    getState().toggleCookingStep(2);
    expect(getState().cookingCompletedSteps).toEqual(new Set([0, 2]));

    // Toggle off
    getState().toggleCookingStep(0);
    expect(getState().cookingCompletedSteps).toEqual(new Set([2]));
  });

  it("starting a new recipe resets previous cooking state", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);
    getState().toggleCookingStep(1);
    expect(getState().cookingCompletedSteps.size).toBe(2);

    getState().startCooking("recipe-2");

    expect(getState().cookingRecipeId).toBe("recipe-2");
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("clear resets cooking state", () => {
    getState().startCooking("recipe-1");
    getState().toggleCookingStep(0);

    getState().clear();

    expect(getState().cookingRecipeId).toBeNull();
    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });

  it("toggleCookingStep does nothing when no recipe is cooking", () => {
    getState().toggleCookingStep(0);

    expect(getState().cookingCompletedSteps).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// Persisted cooking session — the store reads localStorage at module load, so
// these seed storage and re-import the module instead of calling hydrate().
// ---------------------------------------------------------------------------

describe("Persisted cooking session", () => {
  async function reload() {
    vi.resetModules();
    const mod = await import("./recipe-store");
    return mod.useRecipeStore.getState();
  }

  it("restores a persisted cooking session on load", async () => {
    localStorage.setItem(
      "cooksnap:cooking",
      JSON.stringify({ recipeId: "r1", steps: [0, 2] }),
    );

    const state = await reload();

    expect(state.cookingRecipeId).toBe("r1");
    expect(state.cookingCompletedSteps).toEqual(new Set([0, 2]));
  });

  it("ignores corrupt persisted steps", async () => {
    localStorage.setItem(
      "cooksnap:cooking",
      JSON.stringify({ recipeId: "r1", steps: "abc" }),
    );

    const state = await reload();

    expect(state.cookingRecipeId).toBeNull();
    expect(state.cookingCompletedSteps.size).toBe(0);
  });

  it("ignores unparseable persisted state", async () => {
    localStorage.setItem("cooksnap:cooking", "{not json");

    const state = await reload();

    expect(state.cookingRecipeId).toBeNull();
  });
});
