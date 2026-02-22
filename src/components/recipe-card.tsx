"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import type { Recipe } from "@/types";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const timeDisplay = formatDuration(recipe.totalTime) ??
    formatDuration(recipe.cookTime) ??
    formatDuration(recipe.prepTime);

  return (
    <Link href={`/recipes/${recipe.id}`} aria-label={`View recipe: ${recipe.title}`}>
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative aspect-[4/3] bg-muted">
          {recipe.image ? (
            <Image
              src={recipe.image}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl" role="img" aria-label="No image available">
              🍳
            </div>
          )}
        </div>
        <CardContent className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight">
            {recipe.title}
          </h3>
          {/* Metadata row */}
          {(timeDisplay || recipe.servings) && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              {timeDisplay && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                  {timeDisplay}
                </span>
              )}
              {recipe.servings && (
                <span className="inline-flex items-center gap-0.5">
                  <Users className="h-2.5 w-2.5" aria-hidden="true" />
                  {recipe.servings}
                </span>
              )}
            </div>
          )}
          {recipe.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {recipe.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
