import React from "react";
import Link from "next/link";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecipeEditForm } from "./recipe-edit-form";
import type { Recipe } from "@/types";
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/convex/use-recipes", () => ({
  useRecipeActions: () => ({ updateRecipe: update }),
}));
const recipe: Recipe = {
  id: "r1",
  title: "Rice",
  ingredients: ["1 cup rice"],
  instructions: ["Boil rice."],
  sourceUrl: "https://example.com/rice",
  tags: [],
  createdAt: "",
  image: "https://example.com/rice.jpg",
  notes: "Use a lid.",
};
beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("submits actual metadata changes without image or source-bearing fields", async () => {
  render(
    <RecipeEditForm recipe={recipe} onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Author"), {
    target: { value: "Chef" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith("r1", { author: "Chef" }),
  );
});
it("sends image only after removal and preserves notes editing", async () => {
  render(
    <RecipeEditForm recipe={recipe} onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Use less water." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith("r1", {
      image: null,
      notes: "Use less water.",
    }),
  );
});
it("locks repeated save clicks and prevents cancellation after dispatch", async () => {
  update.mockImplementation(() => new Promise(() => {}));
  render(
    <RecipeEditForm recipe={recipe} onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Brown rice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Cancel" }).closest("fieldset")
      ?.disabled,
  ).toBe(true);
});

it("does not render unsafe legacy source links", () => {
  render(
    <RecipeEditForm
      recipe={{ ...recipe, sourceUrl: "javascript:alert(1)" }}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("link", { name: "View original recipe" }),
  ).toBeNull();
});

it("keeps dirty edits when internal navigation is declined", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
  render(
    <>
      <RecipeEditForm recipe={recipe} onSave={vi.fn()} onCancel={vi.fn()} />
      <Link href="/recipes" onClick={navigate}>Recipes</Link>
    </>,
  );
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Brown rice" },
  });
  expect(fireEvent.click(screen.getByRole("link", { name: "Recipes" }))).toBe(false);
  expect(confirm).toHaveBeenCalledWith("Discard your unsaved recipe changes?");
  expect(navigate).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Brown rice");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("link", { name: "Recipes" }));
  expect(navigate).toHaveBeenCalledOnce();
});
