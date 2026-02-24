"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Loader2, Plus, Heart, FolderOpen, X, ArrowLeft, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RecipeCard } from "@/components/recipe-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { useRecipeStore } from "@/stores/recipe-store";
import { useAuth } from "@/components/auth-provider";
import { DEFAULT_TAGS, SLOT_LABELS } from "@/lib/constants";
import { getWeekOffsetForDate } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { MealSlot, Recipe } from "@/types";

/** Suspense wrapper required because useSearchParams triggers CSR bailout. */
export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RecipesContent />
    </Suspense>
  );
}

function RecipesContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const recipes = useRecipeStore((s) => s.recipes);
  const isLoading = useRecipeStore((s) => s.isLoading);
  const error = useRecipeStore((s) => s.error);
  const clearError = useRecipeStore((s) => s.clearError);
  const hydrated = useRecipeStore((s) => s.hydrated);
  const hydrate = useRecipeStore((s) => s.hydrate);
  const assignMeal = useRecipeStore((s) => s.assignMeal);
  const recipeGroups = useRecipeStore((s) => s.recipeGroups);
  const groupMembers = useRecipeStore((s) => s.groupMembers);
  const createGroup = useRecipeStore((s) => s.createGroup);
  const deleteGroup = useRecipeStore((s) => s.deleteGroup);

  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  // ---------- pick mode (assign=DATE_SLOT from meal plan) ----------
  const assignParam = searchParams.get("assign");
  const pickTarget = useMemo(() => {
    if (!assignParam) return null;
    const parts = assignParam.split("_");
    if (parts.length < 2) return null;
    const slot = parts[parts.length - 1] as MealSlot;
    const date = parts.slice(0, parts.length - 1).join("_");
    if (!SLOT_LABELS[slot]) return null;
    return { date, slot };
  }, [assignParam]);

  /** Handle picking a recipe in assign mode — assign and navigate back. */
  const handlePickRecipe = async (recipe: Recipe) => {
    if (!pickTarget) return;
    await assignMeal(pickTarget.date, pickTarget.slot, recipe.id);
    const weekOffset = getWeekOffsetForDate(new Date(pickTarget.date + "T00:00:00"));
    router.push(`/meal-plan?week=${weekOffset}`);
  };

  useEffect(() => {
    if (user && !hydrated && !isLoading) {
      hydrate();
    }
  }, [user, hydrated, isLoading, hydrate]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  // Collect all used tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const r of recipes) {
      for (const t of r.tags) tagSet.add(t);
    }
    // Also include default tags that exist in recipes
    for (const t of DEFAULT_TAGS) {
      if (recipes.some((r) => r.tags.includes(t))) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    let result = recipes;

    // Filter by group
    if (activeGroup) {
      const memberIds = groupMembers[activeGroup] ?? [];
      result = result.filter((r) => memberIds.includes(r.id));
    }

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some((ing) => ing.toLowerCase().includes(q))
      );
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag));
    }
    return result;
  }, [recipes, query, activeTag, activeGroup, groupMembers]);

  const handleDeleteGroup = (groupId: string) => {
    deleteGroup(groupId);
    if (activeGroup === groupId) setActiveGroup(null);
    toast.success("Group deleted");
  };

  return (
    <div className="space-y-4 p-4 pt-6">
      {/* Sticky header: title, search, filters */}
      <div className="sticky top-0 z-10 -mx-4 -mt-6 space-y-4 bg-background px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Recipes</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {/* Pick mode banner */}
        {pickTarget && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <button
              type="button"
              onClick={() => router.push("/meal-plan")}
              className="shrink-0 rounded-full p-1 hover:bg-accent"
              aria-label="Cancel and return to meal plan"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <p className="text-sm">
              Add a recipe for{" "}
              <span className="font-semibold">{SLOT_LABELS[pickTarget.slot]}</span> on{" "}
              <span className="font-semibold">
                {new Date(pickTarget.date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </p>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Search */}
            <div className="relative">
              <label htmlFor="recipe-search" className="sr-only">Search recipes</label>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="recipe-search"
                placeholder="Search recipes or ingredients..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Group & tag filters */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by group and tag">
              {recipeGroups.length > 0 && (
                <>
                  <button onClick={() => setActiveGroup(null)} type="button" className="shrink-0">
                    <Badge variant={activeGroup === null ? "default" : "outline"} className="gap-1">
                      All
                    </Badge>
                  </button>
                  {recipeGroups.map((group) => {
                    const Icon = group.isDefault ? Heart : FolderOpen;
                    return (
                      <div key={group.id} className="relative shrink-0 flex items-center">
                        <button
                          onClick={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
                          type="button"
                        >
                          <Badge variant={activeGroup === group.id ? "default" : "outline"} className="gap-1">
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {group.name}
                          </Badge>
                        </button>
                        {!group.isDefault && (
                          <button
                            type="button"
                            className="relative -ml-1 rounded-full p-2 hover:bg-accent/80 transition-colors before:absolute before:inset-[-8px] before:content-['']"
                            onClick={() => setDeleteGroupId(group.id)}
                            aria-label={`Delete group ${group.name}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setCreateGroupOpen(true)}
                    type="button"
                    className="shrink-0"
                  >
                    <Badge variant="outline" className="gap-1">
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      New
                    </Badge>
                  </button>
                  {/* Divider between groups and tags */}
                  {allTags.length > 0 && (
                    <span className="mx-0.5 h-5 w-px self-center bg-border" aria-hidden="true" />
                  )}
                </>
              )}
              {allTags.length > 0 && (
                <>
                  {!recipeGroups.length && (
                    <button onClick={() => setActiveTag(null)} type="button">
                      <Badge variant={activeTag === null ? "default" : "outline"}>
                        All
                      </Badge>
                    </button>
                  )}
                  {allTags.map((tag) => (
                    <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} type="button">
                      <Badge variant={activeTag === tag ? "default" : "outline"}>
                        {tag}
                      </Badge>
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading recipes...</p>
        </div>
      ) : (
        <>
          {/* Results */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onPick={pickTarget ? () => handlePickRecipe(recipe) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              {hydrated && recipes.length === 0 ? (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-lg font-semibold">No recipes yet</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your first recipe by pasting a URL on the home page
                  </p>
                  <Link
                    href="/"
                    className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add a Recipe
                  </Link>
                </>
              ) : (
                <>
                  <span className="text-4xl" role="img" aria-label="Search">🔍</span>
                  <p className="mt-4 text-sm text-muted-foreground">
                    No recipes match your search.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Create group dialog */}
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onCreate={(name) => {
          createGroup(name);
          toast.success(`Group "${name}" created`);
        }}
      />

      {/* Delete group confirmation */}
      <AlertDialog open={deleteGroupId !== null} onOpenChange={(open) => { if (!open) setDeleteGroupId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the group. Recipes in this group won&apos;t be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteGroupId) handleDeleteGroup(deleteGroupId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
