"use client";

/**
 * Client-only cooking-session state.
 *
 * Everything that used to live here (recipes, meal plan, lists, groups) is now
 * server state owned by Convex and read through the hooks in
 * `src/lib/convex/`. What remains is the one piece of state with no server
 * home: which recipe the user is cooking right now and which steps they have
 * ticked off. It is persisted to localStorage so a reload mid-cook does not
 * lose the user's place.
 */

import { create } from "zustand";

const COOKING_KEY = "cooksnap:cooking";

interface CookingState {
  cookingRecipeId: string | null;
  cookingCompletedSteps: Set<number>;
  startCooking: (recipeId: string) => void;
  stopCooking: () => void;
  toggleCookingStep: (index: number) => void;
  /**
   * Resets the cooking session. Called on sign-out (see
   * `src/components/convex-client-provider.tsx`) so a second account on the
   * same device does not inherit the previous user's cooking state.
   */
  clear: () => void;
}

function readCooking(): { recipeId: string; steps: number[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { recipeId, steps } = parsed as { recipeId?: unknown; steps?: unknown };
    if (typeof recipeId !== "string" || !Array.isArray(steps)) return null;
    return { recipeId, steps: steps.filter((s): s is number => typeof s === "number") };
  } catch {
    return null;
  }
}

function writeCooking(recipeId: string | null, steps: Set<number>): void {
  try {
    if (recipeId === null) localStorage.removeItem(COOKING_KEY);
    else localStorage.setItem(COOKING_KEY, JSON.stringify({ recipeId, steps: [...steps] }));
  } catch {
    /* localStorage unavailable (private mode, blocked cookies) */
  }
}

const initial = readCooking();

export const useRecipeStore = create<CookingState>((set, get) => ({
  cookingRecipeId: initial?.recipeId ?? null,
  cookingCompletedSteps: new Set(initial?.steps ?? []),
  startCooking: (recipeId) => {
    const steps = new Set<number>();
    writeCooking(recipeId, steps);
    set({ cookingRecipeId: recipeId, cookingCompletedSteps: steps });
  },
  stopCooking: () => {
    writeCooking(null, new Set());
    set({ cookingRecipeId: null, cookingCompletedSteps: new Set() });
  },
  toggleCookingStep: (index) => {
    const { cookingRecipeId, cookingCompletedSteps } = get();
    if (!cookingRecipeId) return;
    const next = new Set(cookingCompletedSteps);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    writeCooking(cookingRecipeId, next);
    set({ cookingCompletedSteps: next });
  },
  clear: () => {
    get().stopCooking();
  },
}));
