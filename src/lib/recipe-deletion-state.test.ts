import { beforeEach, describe, expect, it } from "vitest";
import { useRecipeStore } from "@/stores/recipe-store";
import { clearDeletedRecipeState } from "./recipe-deletion-state";

describe("local recipe deletion state", () => {
  beforeEach(() => {
    localStorage.clear();
    useRecipeStore.getState().clear();
  });

  it("clears active cooking and cached groceries while retaining independent items", () => {
    useRecipeStore.getState().startCooking("deleted", 2);
    useRecipeStore.getState().toggleCookingStep(0);
    const manual = { id: "manual", text: "milk", checked: false };
    const other = { id: "other", text: "milk", checked: true, recipeId: "retained" };
    localStorage.setItem("cooksnap:snapshot:user:shopping", JSON.stringify([
      { id: "derived", text: "milk", checked: false, recipeId: "deleted" }, manual, other,
    ]));
    localStorage.setItem("cooksnap:snapshot:user:recipes", JSON.stringify([{ id: "deleted" }, { id: "retained" }]));
    clearDeletedRecipeState("deleted");
    expect(JSON.parse(localStorage.getItem("cooksnap:snapshot:user:recipes")!)).toEqual([{ id: "retained" }]);
    expect(useRecipeStore.getState().cookingRecipeId).toBeNull();
    expect(useRecipeStore.getState().cookingCompletedSteps.size).toBe(0);
    expect(useRecipeStore.getState().cookingRatio).toBe(1);
    expect(JSON.parse(localStorage.getItem("cooksnap:snapshot:user:shopping")!)).toEqual([manual, other]);
  });

  it("continues past a corrupt snapshot", () => {
    localStorage.setItem("cooksnap:snapshot:broken:shopping", "not json");
    localStorage.setItem("cooksnap:snapshot:user:recipes", JSON.stringify([{ id: "deleted" }]));
    clearDeletedRecipeState("deleted");
    expect(localStorage.getItem("cooksnap:snapshot:user:recipes")).toBe("[]");
  });

  it("preserves cooking another recipe and unrelated storage", () => {
    useRecipeStore.getState().startCooking("retained", 3);
    localStorage.setItem("unrelated", "keep");
    clearDeletedRecipeState("deleted");
    expect(useRecipeStore.getState().cookingRecipeId).toBe("retained");
    expect(useRecipeStore.getState().cookingRatio).toBe(3);
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });
});
