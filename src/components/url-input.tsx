"use client";

import { useState } from "react";
import { Loader2, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecipeStore } from "@/stores/recipe-store";
import { toast } from "sonner";
import type { ScrapedRecipe } from "@/types";

export function UrlInput() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const addRecipe = useRecipeStore((s) => s.addRecipe);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Add protocol if missing
    let fullUrl = trimmed;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = "https://" + fullUrl;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to scrape recipe");
        return;
      }

      const scraped = data as ScrapedRecipe;
      addRecipe(scraped, fullUrl);
      setUrl("");
      toast.success(`"${scraped.title}" saved!`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2" aria-busy={loading}>
      <div className="relative flex-1">
        <label htmlFor="recipe-url" className="sr-only">Recipe URL</label>
        <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="recipe-url"
          type="url"
          placeholder="Paste recipe URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScrape()}
          className="pl-9"
          disabled={loading}
        />
      </div>
      <Button onClick={handleScrape} disabled={loading || !url.trim()} aria-label="Scrape recipe">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Snap"
        )}
      </Button>
    </div>
  );
}
