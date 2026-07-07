// ---------------------------------------------------------------------------
// Recipe export/import — JSON backup of the full recipe collection
//
// Export produces a versioned envelope so future format changes stay
// readable. Import is defensive: entries are validated field-by-field and
// invalid ones are skipped rather than failing the whole file.
// ---------------------------------------------------------------------------

import type { Recipe } from "@/types";

export const EXPORT_VERSION = 1;

/** A recipe as restored from an export file — ids/timestamps are reassigned on import. */
export type ImportableRecipe = Omit<Recipe, "id" | "createdAt">;

interface RecipeExportEnvelope {
  app: "cooksnap";
  version: number;
  exportedAt: string;
  recipes: Recipe[];
}

/** Serialize the full recipe collection to pretty-printed JSON. */
export function serializeRecipeExport(recipes: Recipe[]): string {
  const envelope: RecipeExportEnvelope = {
    app: "cooksnap",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
  };
  return JSON.stringify(envelope, null, 2);
}

const DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Validate one raw entry; returns null when it isn't a usable recipe. */
function sanitizeRecipe(raw: unknown): ImportableRecipe | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const ingredients = stringArray(obj.ingredients);
  const instructions = stringArray(obj.instructions);
  if (!title || ingredients === null || instructions === null) return null;
  if (ingredients.length === 0 && instructions.length === 0) return null;

  const rating =
    typeof obj.rating === "number" &&
    Number.isInteger(obj.rating) &&
    obj.rating >= 1 &&
    obj.rating <= 5
      ? obj.rating
      : null;

  const difficulty =
    typeof obj.difficulty === "string" && DIFFICULTIES.has(obj.difficulty)
      ? (obj.difficulty as Recipe["difficulty"])
      : null;

  return {
    title,
    image: optionalString(obj.image),
    ingredients,
    instructions,
    sourceUrl: typeof obj.sourceUrl === "string" ? obj.sourceUrl : "",
    tags: stringArray(obj.tags) ?? [],
    prepTime: optionalString(obj.prepTime),
    cookTime: optionalString(obj.cookTime),
    totalTime: optionalString(obj.totalTime),
    servings: optionalString(obj.servings),
    author: optionalString(obj.author),
    cuisineType: optionalString(obj.cuisineType),
    difficulty,
    rating,
    isFavorite: obj.isFavorite === true,
    notes: optionalString(obj.notes),
  };
}

/**
 * Parse an export file. Throws a user-facing Error when the file isn't a
 * CookSnap export; silently skips individual entries that fail validation.
 */
export function parseRecipeExport(json: string): ImportableRecipe[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("The file is not valid JSON.");
  }

  if (!data || typeof data !== "object" || (data as Record<string, unknown>).app !== "cooksnap") {
    throw new Error("The file is not a CookSnap export.");
  }

  const envelope = data as Record<string, unknown>;
  if (envelope.version !== EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version ${String(envelope.version)} — this app reads version ${EXPORT_VERSION}.`
    );
  }

  if (!Array.isArray(envelope.recipes)) {
    throw new Error("The file is not a CookSnap export.");
  }

  return envelope.recipes
    .map(sanitizeRecipe)
    .filter((r): r is ImportableRecipe => r !== null);
}
