/**
 * Email-confirmation landing page.
 *
 * After the auth callback exchanges the confirmation code, it redirects here
 * with session tokens in the URL hash. This page calls `setSession()` to
 * establish the session in the current browser context — whether that's the
 * email app's in-app mini-browser or Safari (when the user taps "Open in
 * Safari" in the toolbar, the full URL including hash is preserved).
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ConfirmedPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) {
      setReady(true);
      return;
    }

    // Parse session tokens from the URL hash (set by the auth callback).
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      const supabase = createClient();
      supabase.auth
        .setSession({ access_token, refresh_token })
        .catch(() => {
          // R5-24: Show a different message when session setting fails
          setSessionError(true);
        })
        .finally(() => {
          // R5-24: Always clear hash — even on failure — to prevent token leakage
          // in browser history. Tokens are single-use anyway.
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setReady(true);
        });
    } else {
      setReady(true);
    }
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            {ready ? (
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {!ready
              ? "Setting up..."
              : sessionError
                ? "Account confirmed"
                : "Account confirmed!"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ready ? (
            <>
              <p className="text-sm text-muted-foreground">
                {sessionError
                  ? "Your email has been verified, but we couldn\u2019t sign you in automatically. Please sign in manually."
                  : "Your email has been verified and you\u2019re signed in."}
              </p>
              <Button
                className="w-full"
                onClick={() => router.push(sessionError ? "/login" : "/")}
              >
                {sessionError ? "Go to sign in" : "Open CookSnap"}
              </Button>
              {!sessionError && (
                <p className="text-xs text-muted-foreground">
                  Reading this inside your email app? Tap{" "}
                  <span className="font-medium text-foreground">
                    Open in Safari
                  </span>{" "}
                  in the toolbar to continue in your browser.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Verifying your account...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
