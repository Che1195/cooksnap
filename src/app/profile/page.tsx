"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Trash2, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRecipeStore } from "@/stores/recipe-store";
import { createClient } from "@/lib/supabase/client";
import { fetchProfile, updateProfile } from "@/lib/supabase/service";
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

  // Fetch profile on mount
  useEffect(() => {
    if (!user) return;

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
  }, [user]);

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

  /** Sign the user out and redirect to login. */
  async function handleSignOut() {
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
          {profile?.avatarUrl ? (
            <AvatarImage src={profile.avatarUrl} alt={profile.displayName ?? "Avatar"} />
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
