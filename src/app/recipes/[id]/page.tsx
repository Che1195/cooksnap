"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeDetail } from "@/components/recipe-detail";
import { useRecipeStore } from "@/stores/recipe-store";

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const recipes = useRecipeStore((s) => s.recipes);
  const deleteRecipe = useRecipeStore((s) => s.deleteRecipe);

  const recipe = recipes.find((r) => r.id === id);

  if (!recipe) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <span className="text-4xl">🤷</span>
        <p className="mt-4 text-muted-foreground">Recipe not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const handleDelete = () => {
    deleteRecipe(recipe.id);
    router.push("/recipes");
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="line-clamp-1 text-sm font-medium">
          {recipe.title}
        </span>
      </div>
      <RecipeDetail recipe={recipe} onDelete={handleDelete} />
    </div>
  );
}
