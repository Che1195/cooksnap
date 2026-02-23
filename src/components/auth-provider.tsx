"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useRecipeStore } from "@/stores/recipe-store";
import type { User, Session } from "@supabase/supabase-js";

type AuthContext = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get initial user (server-verified, not just local storage)
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      // Also hydrate session so consumers don't see null (R4-8)
      if (user) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
        });
      }
      setLoading(false);
    }).catch(() => {
      // R5-7: Ensure loading state resolves even if getUser fails (e.g. network error)
      setUser(null);
      setLoading(false);
    });

    // Listen for auth changes — handle sign-out centrally (R5-5, R5-25)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (event === "SIGNED_OUT") {
        // Clear all client-side data on sign-out to prevent stale data leaking
        // between accounts. This handles all sign-out paths centrally.
        useRecipeStore.getState().clear();
        window.location.href = "/login";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
