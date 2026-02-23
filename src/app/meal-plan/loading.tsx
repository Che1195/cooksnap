import { Loader2 } from "lucide-react";

/** Instant loading shell for the meal plan page. Prefetched by Next.js Link. */
export default function MealPlanLoading() {
  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meal Plan</h1>
        <div className="flex items-center gap-1">
          <div className="h-9 w-9" />
          <div className="h-9 w-9" />
        </div>
      </div>
      <div className="flex items-center justify-center pt-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
