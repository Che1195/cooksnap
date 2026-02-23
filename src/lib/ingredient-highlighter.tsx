// ---------------------------------------------------------------------------
// Ingredient Highlighter — highlight ingredient names in instruction text
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import type { ParsedIngredient } from "./ingredient-parser";

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate de-pluralized variants of ingredient names so we can match
 * both "tomato" and "tomatoes" regardless of which form appears in the
 * ingredient list vs. the instruction text.
 */
function collectNameVariants(names: string[]): string[] {
  const variants = new Set<string>();
  for (const name of names) {
    variants.add(name);
    if (name.endsWith("ies")) {
      variants.add(name.slice(0, -3) + "y"); // berries → berry
    } else if (name.endsWith("es")) {
      variants.add(name.slice(0, -2)); // tomatoes → tomato
    } else if (name.endsWith("s")) {
      variants.add(name.slice(0, -1)); // carrots → carrot
    }
  }
  return [...variants];
}

/**
 * Highlight ingredient names within instruction step text.
 *
 * Returns React nodes with matched ingredient names wrapped in styled spans.
 * Uses word boundary matching to avoid false highlights (e.g. "oil" in "foil").
 * Sorts ingredient names longest-first so longer names match before substrings.
 * Handles simple plural forms via optional trailing "s"/"es" in the regex.
 */
export function highlightIngredients(
  text: string,
  ingredients: ParsedIngredient[],
): ReactNode {
  if (!text || ingredients.length === 0) return text;

  // Collect unique ingredient names (skip very short ones to avoid noise)
  const rawNames = [
    ...new Set(
      ingredients
        .map((ing) => ing.name.trim().toLowerCase())
        .filter((name) => name.length >= 3),
    ),
  ];

  if (rawNames.length === 0) return text;

  // Generate singular/plural variants and sort longest-first
  const patterns = collectNameVariants(rawNames).sort(
    (a, b) => b.length - a.length,
  );

  // Build a single regex: match any ingredient name with optional plural suffix
  const alternation = patterns.map(escapeRegex).join("|");
  const regex = new RegExp(`\\b(${alternation})(?:e?s)?\\b`, "gi");

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add highlighted match
    parts.push(
      <span key={key++} className="font-semibold text-primary">
        {match[0]}
      </span>,
    );
    lastIndex = regex.lastIndex;
  }

  // No matches found — return plain text
  if (parts.length === 0) return text;

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
