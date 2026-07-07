"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Trash2, ChefHat, RefreshCw, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRecipeStore } from "@/stores/recipe-store";
import { createClient } from "@/lib/supabase/client";
import {
  fetchProfile,
  updateProfile,
  addRecipe as addRecipeToDb,
  updateRecipe as updateRecipeInDb,
  updateRecipeTags,
} from "@/lib/supabase/service";
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
import type { Profile } from "@/types";

/**
 * Profile page — displays user identity, allows editing display name,
 * shows recipe stats, and provides sign-out / delete-account actions.
 */
export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const recipes = useRecipeStore((s) => s.recipes);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  /** Fetch the user's profile from the database. Extracted so it can be retried (R5-42). */
  const loadProfile = useCallback(() => {
    setLoading(true);
    const client = createClient();
    fetchProfile(client)
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName ?? "");
      })
      .catch((err) => {
        console.error("Failed to load profile:", err instanceof Error ? err.message : err);
        toast.error("Failed to load profile");
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch profile on mount
  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user, loadProfile]);

  /** Save updated display name to the database. */
  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      const client = createClient();
      await updateProfile(client, { display_name: displayName.trim() });
      setProfile((prev) => (prev ? { ...prev, displayName: displayName.trim() } : prev));
      toast.success("Profile updated");
    } catch (err) {
      console.error("Failed to update profile:", err instanceof Error ? err.message : err);
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  /** Download the full recipe collection as a JSON backup. */
  function handleExport() {
    const all = useRecipeStore.getState().recipes;
    const json = serializeRecipeExport(all);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cooksnap-recipes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${all.length} recipe${all.length === 1 ? "" : "s"}`);
  }

  /** Import recipes from a JSON backup, skipping duplicates. */
  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const imported = parseRecipeExport(await file.text());
      const existing = useRecipeStore.getState().recipes;
      const existingUrls = new Set(
        existing.map((r) => r.sourceUrl).filter(Boolean)
      );
      const existingTitles = new Set(
        existing.map((r) => r.title.toLowerCase().trim())
      );

      const client = createClient();
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

        const saved = await addRecipeToDb(
          client,
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
          },
          r.sourceUrl
        );

        // Restore the fields addRecipe doesn't cover
        const extras: Partial<Omit<Recipe, "id" | "createdAt">> = {};
        if (r.rating != null) extras.rating = r.rating;
        if (r.difficulty != null) extras.difficulty = r.difficulty;
        if (r.isFavorite) extras.isFavorite = true;
        if (r.notes != null) extras.notes = r.notes;
        if (Object.keys(extras).length > 0) {
          await updateRecipeInDb(client, saved.id, extras);
        }
        if (r.tags.length > 0) {
          await updateRecipeTags(client, saved.id, r.tags);
        }
        added++;
      }

      if (added > 0) await useRecipeStore.getState().hydrate();
      toast.success(
        `Imported ${added} recipe${added === 1 ? "" : "s"}` +
          (skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : "")
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
    // Belt-and-suspenders: clear store before sign-out in addition to the
    // centralized clear in onAuthStateChange (R5-5)
    useRecipeStore.getState().clear();
    await signOut();
    router.push("/login");
    router.refresh();
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
      // Sign out locally and redirect
      await signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Failed to delete account:", err instanceof Error ? err.message : err);
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
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
  const initial = (
    profile?.displayName ?? user?.email?.split("@")[0] ?? "U"
  )
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
            <AvatarImage src={safeAvatarUrl} alt={profile?.displayName ?? "Avatar"} />
          ) : null}
          <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
        </Avatar>
        <h2 className="text-xl font-semibold">
          {profile?.displayName ?? user?.email?.split("@")[0] ?? "User"}
        </h2>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
        {memberSince && (
          <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
        )}
      </div>

      {/* R5-42: Retry button when profile failed to load */}
      {!profile && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              Could not load your profile.
            </p>
            <Button variant="outline" onClick={loadProfile}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

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
                  This will permanently delete your account and all your recipes.
                  This cannot be undone.
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
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
