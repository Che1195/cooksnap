import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeDetail } from "./recipe-detail";
import { CookingView } from "./cooking-view";
import { useRecipeStore } from "@/stores/recipe-store";
import type { Recipe } from "@/types";

const shopping = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/convex/use-recipes", () => ({
  useRecipeActions: () => ({ updateTags: vi.fn() }),
}));
vi.mock("@/lib/convex/use-checked", () => ({
  useCheckedIngredients: () => ({}),
  useCheckedActions: () => ({
    toggleIngredient: vi.fn(),
    clearCheckedIngredients: vi.fn(),
  }),
}));
vi.mock("@/lib/convex/use-groups", () => ({
  useGroups: () => [],
  useGroupMembers: () => ({}),
  useGroupActions: () => ({}),
}));
vi.mock("@/lib/convex/use-shopping", () => ({
  useShoppingList: () => [],
  useShoppingActions: () => ({ addIngredientsToShoppingList: shopping }),
}));
vi.mock("./meal-prep-sheet", () => ({ MealPrepSheet: () => null }));
vi.mock("./schedule-picker-sheet", () => ({ SchedulePickerSheet: () => null }));

const recipe: Recipe = {
  id: "r1",
  title: "Recipe",
  image: null,
  ingredients: [
    "1-2 tbsp butter",
    "2 (14 oz) cans tomatoes",
    "1 cup (120g) flour, plus more",
  ],
  instructions: ["Melt 2 tbsp butter for 20 minutes."],
  servings: "4-6",
  sourceUrl: "",
  tags: [],
  createdAt: "",
};
beforeEach(() => {
  shopping.mockClear();
  useRecipeStore.getState().clear();
});
afterEach(cleanup);

describe("shared recipe projection consumers", () => {
  it("uses factor controls for range yields and passes the same amounts into cooking and shopping", () => {
    const cook = vi.fn();
    const detail = render(<RecipeDetail recipe={recipe} onCook={cook} />);
    expect(
      screen.queryByRole("button", { name: "Increase servings" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease recipe multiplier" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease recipe multiplier" }),
    );
    expect(screen.getByText("1 (14 oz) can tomatoes")).toBeTruthy();
    expect(screen.getByText("1/2-1 tbsp butter")).toBeTruthy();
    expect(screen.getByText("1/2 cup (60g) flour, plus more")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
    const detailAmounts = shopping.mock.calls[0][0] as string[];
    expect(shopping.mock.calls[0][1]).toBe(recipe.id);
    fireEvent.click(screen.getByRole("button", { name: "Cook" }));
    expect(cook).toHaveBeenCalledWith(0.5);
    detail.unmount();
    useRecipeStore.getState().startCooking(recipe.id, 0.5);
    render(<CookingView recipe={recipe} />);
    expect(screen.getByText("1 (14 oz) can tomatoes")).toBeTruthy();
    expect(screen.getByText("1/2-1 tbsp butter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
    expect(shopping.mock.calls[1][0]).toEqual(detailAmounts);
    expect(shopping.mock.calls[1][1]).toBe(recipe.id);
    expect(
      screen.getByText("butter", { selector: ".font-semibold" }).parentElement
        ?.textContent,
    ).toBe("Melt 1 tbsp butter for 20 minutes.");
    fireEvent.click(screen.getByRole("button", { name: "Reset amounts" }));
    expect(screen.getByText("2 (14 oz) cans tomatoes")).toBeTruthy();
    expect(useRecipeStore.getState().cookingRatio).toBe(1);
  });
  it("keeps original amount text at factor one and supports unknown yield", () => {
    render(<RecipeDetail recipe={{ ...recipe, servings: null }} />);
    expect(screen.getByText("1-2 tbsp butter")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Increase recipe multiplier" }),
    ).toBeTruthy();
  });
  it("uses serving counts only for an exact yield", () => {
    render(<RecipeDetail recipe={{ ...recipe, servings: "4 servings" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase servings" }));
    expect(screen.getByText("5 servings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset amounts" }));
    expect(screen.getByText("4 servings")).toBeTruthy();
  });
});
