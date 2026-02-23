// ---------------------------------------------------------------------------
// Ingredient Highlighter — highlight food words in instruction text
//
// Uses a dictionary of known food/ingredient words (derived from the
// ingredient categorizer's keyword map) to highlight any food term that
// appears in recipe instruction text. This is intentionally decoupled from
// the recipe's own ingredient list so it catches partial matches — e.g.
// "onion" in the instructions highlights even when the ingredient list
// says "red onion".
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { CATEGORY_KEYWORDS } from "./ingredient-categorizer";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words from the categorizer that are process descriptors, not food items. */
const EXCLUDED = new Set([
  "canned",
  "jarred",
  "seasoning",
  "spice",
  "herb",
  "seafood",
]);

/**
 * Build the food word dictionary once at module load.
 * Flattens all keywords from the ingredient categorizer, filters out
 * non-food descriptors, and sorts longest-first so multi-word phrases
 * match before their individual words (e.g. "olive oil" before "oil").
 */
function buildFoodWords(): string[] {
  const words = CATEGORY_KEYWORDS
    .flatMap(([, keywords]) => keywords)
    .filter((w) => !EXCLUDED.has(w));

  // Supplement with common instruction-text terms not in the categorizer
  words.push(
    "green onion",
    "green onions",
    "red onion",
    "white onion",
    "yellow onion",
    "lemon juice",
    "lime juice",
    "orange juice",
    "lemon zest",
    "lime zest",
    "orange zest",
    "sesame seeds",
    "breadcrumbs",
  );

  // Deduplicate and sort longest-first
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

const FOOD_WORDS = buildFoodWords();

/** Pre-built regex matching any food word with optional plural suffix. */
const FOOD_REGEX = new RegExp(
  `\\b(${FOOD_WORDS.map(escapeRegex).join("|")})(?:e?s)?\\b`,
  "gi",
);

/**
 * Highlight food/ingredient words within instruction step text.
 *
 * Returns React nodes with matched words wrapped in styled spans.
 * Uses word-boundary matching to avoid false highlights (e.g. "oil" won't
 * match inside "foil"). Multi-word phrases are matched before single words.
 */
export function highlightIngredients(text: string): ReactNode {
  if (!text) return text;

  // Reset lastIndex — the regex is module-level and stateful
  FOOD_REGEX.lastIndex = 0;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = FOOD_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} className="font-semibold text-primary">
        {match[0]}
      </span>,
    );
    lastIndex = FOOD_REGEX.lastIndex;
  }

  if (parts.length === 0) return text;

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
