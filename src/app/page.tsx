"use client";

import { useEffect, useState } from "react";
import { UrlInput } from "@/components/url-input";
import { RecipeCard } from "@/components/recipe-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const recipes = useRecipeStore((s) => s.recipes);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const migrateFromLocalStorage = useRecipeStore((s) => s.migrateFromLocalStorage);
  const [migrating, setMigrating] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);

  // Hydrate store when authenticated
  useEffect(() => {
    if (user) {
      hydrate();
    }
  }, [user, hydrate]);

  // Check for old localStorage data
  useEffect(() => {
    if (user && !isLoading) {
      const raw = localStorage.getItem("cooksnap-storage");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const state = parsed?.state ?? parsed;
          const recipes = state?.recipes ?? [];
          if (recipes.length > 0) {
            setHasLocalData(true);
          }
        } catch {
          // Invalid JSON, ignore
        }
      }
    }
  }, [user, isLoading]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleMigrate = async () => {
    setMigrating(true);
    const result = await migrateFromLocalStorage();
    setMigrating(false);
    setHasLocalData(false);
    if (result.migrated) {
      toast.success(`Imported ${result.recipeCount} recipe${result.recipeCount !== 1 ? "s" : ""} from local storage!`);
    } else {
      toast.error("Failed to import local data.");
    }
  };

  const handleDismissMigration = () => {
    localStorage.removeItem("cooksnap-storage");
    setHasLocalData(false);
  };

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6 p-4 pt-6">
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">CookSnap</h1>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a recipe link and snap it into your collection
          </p>
        </div>
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading recipes...</p>
        </div>
      </div>
    );
  }

  const recent = recipes.slice(0, 6);

  return (
    <div className="space-y-6 p-4 pt-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CookSnap</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a recipe link and snap it into your collection
        </p>
      </div>

      {/* Migration banner */}
      {hasLocalData && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Local recipes found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You have recipes saved from before. Would you like to import them into your account?
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleMigrate} disabled={migrating}>
              {migrating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {migrating ? "Importing..." : "Import recipes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismissMigration} disabled={migrating}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* URL Input */}
      <UrlInput />

      {/* Recent recipes */}
      {recent.length > 0 ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recent</h2>
          <div className="grid grid-cols-2 gap-3">
            {recent.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="text-5xl" role="img" aria-label="Empty plate">🍽️</span>
          <p className="mt-4 text-sm text-muted-foreground">
            No recipes yet. Paste a URL above to get started!
          </p>
        </div>
      )}
    </div>
  );
}
