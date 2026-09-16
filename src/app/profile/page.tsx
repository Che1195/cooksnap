"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  Loader2,
  LogOut,
  Trash2,
  ChefHat,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useCurrentUser } from "@/lib/convex/use-user";
import { useRecipeActions, useRecipes } from "@/lib/convex/use-recipes";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRecipeStore } from "@/stores/recipe-store";
import { serializeRecipeExport, parseRecipeExport } from "@/lib/recipe-export";
import type { Recipe } from "@/types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

/** Stable reference so `recipes` keeps a steady identity while loading. */
const EMPTY_RECIPES: Recipe[] = [];

/**
 * Profile page — displays user identity, allows editing display name,
 * shows recipe stats, and provides sign-out / delete-account actions.
 */
export default function ProfilePage() {
  const { profile, signOut } = useCurrentUser();
  const updateImportPreference = useMutation(api.users.updateImportPreference);
  const [savingPreference, setSavingPreference] = useState(false);
  const preferenceLock = useRef(false);
  const [preferenceError, setPreferenceError] = useState("");
  async function changeImportPreference(reviewBeforeSaving: boolean) {
    if (preferenceLock.current || !profile) return;
    preferenceLock.current = true;
    setSavingPreference(true);
    setPreferenceError("");
    try {
      await updateImportPreference({ reviewBeforeSaving });
    } catch {
      setPreferenceError("Unable to save your import setting. Try again.");
    } finally {
      preferenceLock.current = false;
      setSavingPreference(false);
    }
  }
  const liveRecipes = useRecipes();
  const recipes = liveRecipes ?? EMPTY_RECIPES;
  const { addRecipe, updateRecipe, updateTags } = useRecipeActions();
  const updateDisplayName = useMutation(api.users.updateDisplayName);

  const [draftName, setDraftName] = useState<{ from: string; value: string }>({
    from: "",
    value: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Export writes `recipes` to a file and import de-duplicates against it, so
  // neither may run before the list has loaded — an empty list would export an
  // empty backup and re-import every recipe as new.
  const loading = profile === undefined || liveRecipes === undefined;

  // Seed the input from the profile when it arrives, and re-seed whenever the
  // saved name changes underneath. Derived during render rather than in an
  // effect so the field is never briefly empty.
  const savedName = profile?.displayName ?? "";
  if (draftName.from !== savedName)
    setDraftName({ from: savedName, value: savedName });
  const displayName = draftName.value;
  const setDisplayName = (value: string) =>
    setDraftName((d) => ({ ...d, value }));

  /** Save updated display name to the database. */
  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      await updateDisplayName({ displayName: displayName.trim() });
      toast.success("Profile updated");
    } catch (err) {
      console.error(
        "Failed to update profile:",
        err instanceof Error ? err.message : err,
      );
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  /** Download the full recipe collection as a JSON backup. */
  function handleExport() {
    const all = recipes;
    const json = serializeRecipeExport(all);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cooksnap-recipes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${all.length} recipe${all.length === 1 ? "" : "s"}`,
    );
  }

  /** Import recipes from a JSON backup, skipping duplicates. */
  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const imported = parseRecipeExport(await file.text());
      const existing = recipes;
      const existingUrls = new Set(
        existing.map((r) => r.sourceUrl).filter(Boolean),
      );
      const existingTitles = new Set(
        existing.map((r) => r.title.toLowerCase().trim()),
      );

      let added = 0;
      let skipped = 0;

      for (const r of imported) {
        const isDuplicate =
          (r.sourceUrl && existingUrls.has(r.sourceUrl)) ||
          existingTitles.has(r.title.toLowerCase().trim());
        if (isDuplicate) {
          skipped++;
          continue;
        }

        const savedId = await addRecipe(
          {
            title: r.title,
            image: r.image,
            ingredients: r.ingredients,
            instructions: r.instructions,
            prepTime: r.prepTime,
            cookTime: r.cookTime,
            totalTime: r.totalTime,
            servings: r.servings,
            author: r.author,
            cuisineType: r.cuisineType,
            interpretation: r.interpretation,
          },
          r.sourceUrl,
        );

        // Restore the fields create doesn't cover. `image` is deliberately
        // absent: addRecipe already carried it, and updateRecipe treats the
        // key's presence as a change that drops the stored file.
        const extras: Partial<Omit<Recipe, "id" | "createdAt">> = {};
        if (r.rating != null) extras.rating = r.rating;
        if (r.difficulty != null) extras.difficulty = r.difficulty;
        if (r.isFavorite) extras.isFavorite = true;
        if (r.notes != null) extras.notes = r.notes;
        if (Object.keys(extras).length > 0) {
          await updateRecipe(savedId, extras);
        }
        if (r.tags.length > 0) {
          await updateTags(savedId, r.tags);
        }
        added++;
      }

      toast.success(
        `Imported ${added} recipe${added === 1 ? "" : "s"}` +
          (skipped
            ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`
            : ""),
      );
    } catch (err) {
      console.error("Import failed:", err instanceof Error ? err.message : err);
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  /** Sign the user out and redirect to login. */
  async function handleSignOut() {
    // Clear client-side data before sign-out so nothing leaks between accounts
    // (R5-5). Clerk's signOut also redirects to /login on its own.
    useRecipeStore.getState().clear();
    await signOut();
  }

  /** Permanently delete the user's account and auth record. */
  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete account");
      }
      // Belt-and-suspenders: clear store before sign-out (R5-5)
      useRecipeStore.getState().clear();
      // Sign out locally; Clerk's signOut redirects to /login on its own.
      await signOut();
    } catch (err) {
      console.error(
        "Failed to delete account:",
        err instanceof Error ? err.message : err,
      );
      toast.error(
        err instanceof Error ? err.message : "Failed to delete account",
      );
      setDeleting(false);
    }
  }

  // Format the "member since" date
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  // R5-30: Validate avatar URL is HTTPS to prevent tracking pixels from arbitrary origins
  const safeAvatarUrl =
    typeof profile?.avatarUrl === "string" &&
    profile.avatarUrl.startsWith("https://")
      ? profile.avatarUrl
      : null;

  // Derive initial for avatar fallback
  const initial = (profile?.displayName ?? profile?.email?.split("@")[0] ?? "U")
    .charAt(0)
    .toUpperCase();

  // ---- Loading skeleton ----
  if (loading) {
    return (
      <div className="space-y-6 p-4 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Profile</h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 py-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>

        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Avatar + Identity */}
      <div className="flex flex-col items-center gap-2 py-4">
        <Avatar className="h-20 w-20 text-2xl">
          {safeAvatarUrl ? (
            <AvatarImage
              src={safeAvatarUrl}
              alt={profile?.displayName ?? "Avatar"}
            />
          ) : null}
          <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
        </Avatar>
        <h2 className="text-xl font-semibold">
          {profile?.displayName ?? profile?.email?.split("@")[0] ?? "User"}
        </h2>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
        {memberSince && (
          <p className="text-xs text-muted-foreground">
            Member since {memberSince}
          </p>
        )}
      </div>

      {/* Edit Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipe imports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={profile?.reviewBeforeSaving ?? true}
              disabled={!profile || savingPreference}
              onChange={(event) =>
                void changeImportPreference(event.target.checked)
              }
              aria-describedby="review-imports-description"
              className="h-5 w-5 accent-primary"
            />
            Review recipes before saving
          </label>
          <p
            id="review-imports-description"
            className="text-sm text-muted-foreground"
          >
            Review recipes imported from links. This setting syncs across your
            devices. Incomplete recipes and flagged details always need review.
          </p>
          <p role="status" className="text-sm text-muted-foreground">
            {savingPreference ? "Saving import setting…" : ""}
          </p>
          {preferenceError && (
            <p role="alert" className="text-sm text-destructive">
              {preferenceError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle>Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{recipes.length}</p>
              <p className="text-xs text-muted-foreground">
                Recipe{recipes.length !== 1 ? "s" : ""} saved
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Card */}
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleExport}
            disabled={recipes.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export recipes (JSON)
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {importing ? "Importing..." : "Import recipes"}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import recipes from JSON file"
            onChange={handleImportFile}
          />
        </CardContent>
      </Card>

      {/* Account Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete account</DialogTitle>
                <DialogDescription>
                  This will permanently delete your account and all your
                  recipes. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {deleting ? "Deleting..." : "Delete account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
