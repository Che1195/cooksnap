import type { Doc } from "../_generated/dataModel";
import type { IssueReport, Recipe, RecipeGroup } from "../../src/types";

export function isoFromCreation(ms: number): string {
  return new Date(ms).toISOString();
}

export function toRecipe(doc: Doc<"recipes">, imageUrl: string | null): Recipe {
  return {
    id: doc._id,
    title: doc.title,
    image: imageUrl ?? doc.image ?? null,
    ingredients: doc.ingredients,
    instructions: doc.instructions,
    ...(doc.interpretation ? { interpretation: doc.interpretation } : {}),
    sourceUrl: doc.sourceUrl,
    tags: doc.tags,
    createdAt: isoFromCreation(doc._creationTime),
    prepTime: doc.prepTime ?? null,
    cookTime: doc.cookTime ?? null,
    totalTime: doc.totalTime ?? null,
    servings: doc.servings ?? null,
    author: doc.author ?? null,
    cuisineType: doc.cuisineType ?? null,
    difficulty: doc.difficulty ?? null,
    rating: doc.rating ?? null,
    isFavorite: doc.isFavorite,
    notes: doc.notes ?? null,
  };
}

export function toGroup(doc: Doc<"recipeGroups">): RecipeGroup {
  return {
    id: doc._id,
    name: doc.name,
    icon: doc.icon ?? null,
    sortOrder: doc.sortOrder,
    isDefault: doc.isDefault,
    createdAt: isoFromCreation(doc._creationTime),
  };
}

export function toIssue(doc: Doc<"issueReports">): IssueReport {
  return {
    id: doc._id,
    reporterId: doc.reporterId ?? "",
    reporterEmail: doc.reporterEmail ?? null,
    title: doc.title,
    description: doc.description,
    steps: doc.steps ?? null,
    expected: doc.expected ?? null,
    actual: doc.actual ?? null,
    pageUrl: doc.pageUrl ?? null,
    severity: doc.severity,
    status: doc.status,
    createdAt: isoFromCreation(doc._creationTime),
    updatedAt: isoFromCreation(doc._creationTime),
  };
}
