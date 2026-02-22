"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RecipesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Recipes error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Could not load recipes.
      </p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  );
}
