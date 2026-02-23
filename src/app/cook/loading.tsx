import { Loader2 } from "lucide-react";

/** Instant loading shell for the cook page. Prefetched by Next.js Link. */
export default function CookLoading() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
