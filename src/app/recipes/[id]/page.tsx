"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeDetail } from "@/components/recipe-detail";
import { RecipeEditForm } from "@/components/recipe-edit-form";
import { useRecipeStore } from "@/stores/recipe-store";
import { useRecipeActions, useRecipes } from "@/lib/convex/use-recipes";
import { toast } from "sonner";

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  // Read from the list rather than `useRecipe(id)`: `api.recipes.get` validates
  // its argument as an `Id<"recipes">`, so a hand-typed or stale URL would throw
  // instead of rendering the "Recipe not found" state below.
  const recipes = useRecipes();
  const recipe = recipes?.find((r) => r.id === id);
  const { deleteRecipe } = useRecipeActions();
  const startCooking = useRecipeStore((s) => s.startCooking);
  const [editing, setEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (recipes === undefined || isDeleting) {
    return (
      <div className="flex flex-col items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          {isDeleting ? "Deleting recipe..." : "Loading recipe..."}
        </p>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <span className="text-4xl" role="img" aria-label="Not found">🤷</span>
        <p className="mt-4 text-muted-foreground">Recipe not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteRecipe(recipe.id);
      router.push("/recipes");
    } catch {
      setIsDeleting(false);
      toast.error("Failed to delete recipe");
    }
  };

  const handleCook = () => {
    startCooking(recipe.id);
    router.push("/cook");
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="line-clamp-1 flex-1 text-sm font-medium">
          {recipe.title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditing(!editing)}
          aria-label={editing ? "Cancel editing" : "Edit recipe"}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      {editing ? (
        <RecipeEditForm
          recipe={recipe}
          onSave={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <RecipeDetail recipe={recipe} onDelete={handleDelete} onCook={handleCook} />
      )}
    </div>
  );
}
