import { Loader2 } from "lucide-react";

/** Instant loading shell for the home page. Shown immediately on navigation. */
export default function HomeLoading() {
  return (
    <div className="space-y-6 p-4 pt-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CookSnap</h1>
          <div className="flex items-center gap-1">
            <div className="h-9 w-9" />
            <div className="h-9 w-9" />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Save and organize your favorite recipes.
        </p>
      </div>
      <div className="flex items-center justify-center pt-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
