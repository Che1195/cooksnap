"use client";

import { type ReactNode, useEffect } from "react";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
const convex = new ConvexReactClient(url);

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  useEffect(() => {
    if (isAuthenticated) void ensure({});
  }, [isAuthenticated, ensure]);
  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithClerk>
  );
}
