"use client";

import { useCurrentUser } from "@/lib/convex/use-user";
import { useRecipeStore } from "@/stores/recipe-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, LogOut, MessageSquareWarning } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export function UserMenu() {
  const { profile, isSignedIn, signOut } = useCurrentUser();
  const router = useRouter();

  // Render as soon as Clerk says we're signed in. `profile` arrives a Convex
  // round-trip later, so the labels fall back until it does rather than the
  // whole menu popping in late.
  if (!isSignedIn) return null;

  const displayName =
    profile?.displayName || profile?.email?.split("@")[0] || "User";
  const initial = displayName.charAt(0).toUpperCase();
  // Validate avatar URL is HTTPS to prevent tracking pixels from arbitrary origins (R3-11)
  const rawAvatar = profile?.avatarUrl;
  const safeAvatarUrl = typeof rawAvatar === "string" && rawAvatar.startsWith("https://") ? rawAvatar : null;

  async function handleSignOut() {
    // Clear client-side data before sign-out so nothing leaks between accounts
    // (R5-5). Clerk's signOut also redirects to /login on its own.
    useRecipeStore.getState().clear();
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label="User menu"
        >
          {safeAvatarUrl ? (
            <Image
              src={safeAvatarUrl}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {initial}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {profile?.email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/issues")}>
          <MessageSquareWarning className="mr-2 h-4 w-4" />
          Issue reports
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
