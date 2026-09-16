"use client";

import { RecipeForm } from "@/components/recipe-form";
import { useRecipeActions } from "@/lib/convex/use-recipes";
import type { Recipe, ScrapedRecipe } from "@/types";

interface RecipeEditFormProps {
  recipe: Recipe;
  onSave: () => void;
  onCancel: () => void;
}

export function RecipeEditForm({
  recipe,
  onSave,
  onCancel,
}: RecipeEditFormProps) {
  const { updateRecipe } = useRecipeActions();
  async function save(draft: ScrapedRecipe, notes?: string | null) {
    const updates: Partial<Omit<Recipe, "id" | "createdAt">> = {};
    for (const key of [
      "title",
      "image",
      "servings",
      "prepTime",
      "cookTime",
      "totalTime",
      "author",
      "cuisineType",
    ] as const) {
      if (draft[key] !== recipe[key])
        Object.assign(updates, { [key]: draft[key] });
    }
    for (const key of ["ingredients", "instructions"] as const) {
      if (JSON.stringify(draft[key]) !== JSON.stringify(recipe[key]))
        updates[key] = draft[key];
    }
    if (notes !== (recipe.notes ?? null)) updates.notes = notes;
    if (Object.keys(updates).length) await updateRecipe(recipe.id, updates);
    onSave();
  }
  return (
    <div className="p-4">
      <RecipeForm
        initial={recipe}
        sourceUrl={recipe.sourceUrl}
        notes={recipe.notes ?? null}
        onSave={save}
        onCancel={onCancel}
        submitLabel="Save Changes"
      />
    </div>
  );
}
