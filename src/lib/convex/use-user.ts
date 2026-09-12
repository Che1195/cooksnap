"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Profile } from "@/types";

export function useCurrentUser(): {
  profile: Profile | null | undefined;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
} {
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  return {
    profile: isSignedIn ? profile : null,
    isLoaded,
    isSignedIn: !!isSignedIn,
    signOut: async () => {
      await signOut({ redirectUrl: "/login" });
    },
  };
}
