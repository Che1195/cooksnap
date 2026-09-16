"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexReady } from "./use-ready";
import { clearDeletedRecipeState } from "@/lib/recipe-deletion-state";
import type { Recipe, ScrapedRecipe } from "@/types";

export function useRecipes(): Recipe[] | undefined {
  const ready = useConvexReady();
  return useQuery(api.recipes.list, ready ? {} : "skip");
}

export function useRecipe(id: string): Recipe | null | undefined {
  const ready = useConvexReady();
  return useQuery(api.recipes.get, ready ? { id: id as Id<"recipes"> } : "skip");
}

/** Only http(s) and inline data images can be copied into our own storage. */
function isPersistable(image: string | null | undefined): image is string {
  return typeof image === "string" && (/^https?:\/\//.test(image) || image.startsWith("data:image/"));
}

async function persistImage(recipeId: string, image: string): Promise<void> {
  try {
    const res = await fetch("/api/persist-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, imageUrl: image }),
    });
    if (!res.ok) console.error("Failed to persist recipe image:", res.status);
  } catch (e) {
    console.error("Failed to persist recipe image:", e instanceof Error ? e.message : String(e));
  }
}

export function useRecipeActions() {
  const create = useMutation(api.recipes.create);
  const update = useMutation(api.recipes.update);
  const remove = useMutation(api.recipes.remove);
  const setTags = useMutation(api.recipes.setTags);

  return useMemo(
    () => ({
      addRecipe: async (scraped: ScrapedRecipe, sourceUrl: string, importId?: string): Promise<string> => {
        const id = await create({
          title: scraped.title,
          image: scraped.image,
          ingredients: scraped.ingredients,
          instructions: scraped.instructions,
          sourceUrl,
          prepTime: scraped.prepTime ?? null,
          cookTime: scraped.cookTime ?? null,
          totalTime: scraped.totalTime ?? null,
          servings: scraped.servings ?? null,
          author: scraped.author ?? null,
          cuisineType: scraped.cuisineType ?? null,
          tags: [],
          ...(scraped.interpretation ? { interpretation: scraped.interpretation } : {}),
          ...(importId ? { importId } : {}),
        });
        if (isPersistable(scraped.image)) void persistImage(id, scraped.image);
        return id;
      },
      /**
       * Patches a recipe.
       *
       * Callers must include `image` ONLY when the user actually changed it: the
       * mutation treats the key's presence as a change and deletes the currently
       * attached storage file. Never synthesize it from the recipe you are
       * editing. `sourceUrl` is immutable and is stripped here.
       */
      updateRecipe: async (id: string, updates: Partial<Omit<Recipe, "id" | "createdAt">>): Promise<void> => {
        const { sourceUrl: _ignored, ...rest } = updates;
        await update({ id: id as Id<"recipes">, updates: rest });
        if (updates.image !== undefined && isPersistable(updates.image)) void persistImage(id, updates.image);
      },
      deleteRecipe: async (id: string): Promise<void> => {
        await remove({ id: id as Id<"recipes"> });
        clearDeletedRecipeState(id);
      },
      updateTags: async (id: string, tags: string[]): Promise<void> => {
        await setTags({ id: id as Id<"recipes">, tags });
      },
    }),
    [create, update, remove, setTags],
  );
}
