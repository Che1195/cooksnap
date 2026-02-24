// ---------------------------------------------------------------------------
// Ingredient Parser — parse, scale, and format recipe ingredients
// ---------------------------------------------------------------------------

export interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  original: string;
}

// ---------------------------------------------------------------------------
// Unicode fraction map
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const UNICODE_FRACTION_PATTERN = new RegExp(
  `[${Object.keys(UNICODE_FRACTIONS).join("")}]`,
);

// ---------------------------------------------------------------------------
// Known units (case-insensitive match)
// ---------------------------------------------------------------------------

const UNITS = new Set([
  "cup",
  "cups",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "teaspoon",
  "teaspoons",
  "tsp",
  "ounce",
  "ounces",
  "oz",
  "pound",
  "pounds",
  "lb",
  "lbs",
  "gram",
  "grams",
  "g",
  "kilogram",
  "kilograms",
  "kg",
  "milliliter",
  "milliliters",
  "ml",
  "liter",
  "liters",
  "l",
  "pinch",
  "dash",
  "clove",
  "cloves",
  "can",
  "cans",
  "bunch",
  "bunches",
  "slice",
  "slices",
  "piece",
  "pieces",
  "head",
  "heads",
  "stalk",
  "stalks",
  "sprig",
  "sprigs",
  "handful",
  "package",
  "pkg",
]);

// ---------------------------------------------------------------------------
// Fraction helpers
// ---------------------------------------------------------------------------

function parseFraction(s: string): number | null {
  const parts = s.split("/");
  if (parts.length !== 2) return null;
  const num = parseFloat(parts[0]);
  const den = parseFloat(parts[1]);
  if (isNaN(num) || isNaN(den) || den === 0) return null;
  return num / den;
}

/** Replace unicode fractions in a string with their decimal value. */
function replaceUnicodeFractions(s: string): { text: string; had: boolean } {
  let had = false;
  // Insert space between a digit and a unicode fraction (e.g. "1½" → "1 ½")
  let normalized = s.replace(
    new RegExp(`(\\d)(${UNICODE_FRACTION_PATTERN.source})`, "g"),
    "$1 $2",
  );
  const text = normalized.replace(UNICODE_FRACTION_PATTERN, (match) => {
    had = true;
    return String(UNICODE_FRACTIONS[match] ?? match);
  });
  return { text, had };
}

// ---------------------------------------------------------------------------
// extractPrepNote — pull trailing parenthetical prep details from a name
// ---------------------------------------------------------------------------

/**
 * Extract a trailing parenthetical or comma-separated detail as a prep note.
 * Handles messy formats from recipe scrapers: "(, sliced)", "(sliced)", etc.
 * Also treats trailing comma-separated text as a prep note:
 *   "chicken breast, diced" → name: "chicken breast", prepNote: "diced"
 * Does NOT extract mid-string parentheticals like "(14 oz)" in "1 (14 oz) can".
 */
function extractPrepNote(name: string): { name: string; prepNote: string | null } {
  // First try trailing parenthetical — supports single (…) or double ((…))
  const match = name.match(/\(\(?([^)]*)\)?\)\s*$/);
  if (match) {
    let nameWithout = name.slice(0, match.index).trim();
    // Remove trailing comma/spaces left behind
    nameWithout = nameWithout.replace(/[,;\s]+$/, "").trim();
    if (nameWithout.length > 0) {
      let note = match[1].trim();
      // Clean messy formats: "(, sliced)" → "sliced", "(; chopped)" → "chopped"
      note = note.replace(/^[,;\s]+/, "").replace(/[,;\s]+$/, "").trim();
      if (note.length > 0) {
        return { name: nameWithout, prepNote: note };
      }
    }
  }

  // Then try trailing comma-separated detail (e.g. "chicken breast, diced")
  // Only split on the FIRST comma that's not inside parentheses
  const commaIdx = findTrailingComma(name);
  if (commaIdx !== -1) {
    const namePart = name.slice(0, commaIdx).trim();
    const detailPart = name.slice(commaIdx + 1).trim();
    if (namePart.length > 0 && detailPart.length > 0) {
      return { name: namePart, prepNote: detailPart };
    }
  }

  return { name, prepNote: null };
}

/**
 * Find the index of the first comma in the string that is not inside parentheses.
 * Returns -1 if no such comma exists.
 */
function findTrailingComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth = Math.max(0, depth - 1);
    else if (s[i] === "," && depth === 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// parseIngredient
// ---------------------------------------------------------------------------

/**
 * Parse a raw ingredient string into structured data.
 *
 * Examples:
 *   "2 cups flour"      → { quantity: 2, unit: "cups", name: "flour" }
 *   "1/2 cup sugar"     → { quantity: 0.5, unit: "cup", name: "sugar" }
 *   "salt to taste"     → { quantity: null, unit: null, name: "salt to taste" }
 *   "1 onion (, sliced)" → { ..., name: "onion", prepNote: "sliced" }
 */
export function parseIngredient(raw: string): ParsedIngredient {
  const original = raw;
  let text = raw.trim();

  if (!text) {
    return { quantity: null, unit: null, name: "", prepNote: null, original };
  }

  // Section headers (e.g. "## For the sauce:") — return as-is, no parsing
  if (text.startsWith("## ")) {
    return { quantity: null, unit: null, name: text.slice(3), prepNote: null, original };
  }

  // --- Step 1: Replace unicode fractions ---------------------------------
  const { text: replaced, had: hadUnicode } = replaceUnicodeFractions(text);
  text = replaced;

  // --- Step 2: Extract quantity ------------------------------------------
  // Matches: "1 1/2", "1/2", "1-2", "1.5", "1", or bare decimal from unicode
  // Also handles mixed like "1 0.5" (from "1½")
  const qtyRegex =
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*-\s*\d+(?:\.\d+)?|\d+\.?\d*(?:\s+\d*\.?\d+)?)\s*/;
  const qtyMatch = text.match(qtyRegex);

  let quantity: number | null = null;
  let rest = text;

  if (qtyMatch) {
    const qtyStr = qtyMatch[1].trim();
    rest = text.slice(qtyMatch[0].length).trim();

    // Range: "1-2" → take first number
    if (/^\d+\s*-\s*\d+/.test(qtyStr)) {
      quantity = parseFloat(qtyStr.split("-")[0].trim());
    }
    // Mixed number: "1 1/2" or "1 0.5" (from unicode replacement)
    else if (/^\d+\s+\d+\/\d+$/.test(qtyStr)) {
      const [whole, frac] = qtyStr.split(/\s+/);
      quantity = parseInt(whole) + (parseFraction(frac) ?? 0);
    } else if (hadUnicode && /^\d+\s+\d*\.?\d+$/.test(qtyStr)) {
      const parts = qtyStr.split(/\s+/);
      quantity = parseFloat(parts[0]) + parseFloat(parts[1]);
    }
    // Simple fraction: "1/2"
    else if (qtyStr.includes("/")) {
      quantity = parseFraction(qtyStr);
    }
    // Plain number: "2", "0.5", "1.5"
    else {
      quantity = parseFloat(qtyStr);
    }

    if (quantity !== null && isNaN(quantity)) {
      quantity = null;
    }
  }

  // No quantity found → return whole string as name (with prep note extracted)
  if (quantity === null) {
    const { name: cleanName, prepNote } = extractPrepNote(raw.trim());
    return { quantity: null, unit: null, name: cleanName, prepNote, original };
  }

  // --- Step 3: Extract unit ----------------------------------------------
  let unit: string | null = null;

  // Check if the next word is a known unit
  const unitMatch = rest.match(/^(\S+)\s*/);
  if (unitMatch) {
    const candidate = unitMatch[1].toLowerCase().replace(/[.,]$/, "");
    if (UNITS.has(candidate)) {
      unit = unitMatch[1].replace(/[.,]$/, "");
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }

  // --- Step 4: Remaining text is the ingredient name ---------------------
  const rawName = rest || original.replace(/^[\d\s/.\-½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+/, "").trim();

  // --- Step 5: Extract trailing parenthetical as prep note ---------------
  const { name, prepNote } = extractPrepNote(rawName);

  return { quantity, unit, name, prepNote, original };
}

// ---------------------------------------------------------------------------
// formatIngredientMain — rebuild ingredient text without prep note
// ---------------------------------------------------------------------------

/**
 * Return the main ingredient text (quantity + unit + name) without the prep note.
 * Use this for display when rendering the prep note separately with distinct styling.
 */
export function formatIngredientMain(
  parsed: ParsedIngredient,
  ratio: number = 1,
): string {
  if (parsed.quantity === null) {
    return parsed.name;
  }

  const scaled = parsed.quantity * ratio;
  const qty = formatQuantity(scaled);
  const parts = [qty];
  if (parsed.unit) parts.push(parsed.unit);
  if (parsed.name) parts.push(parsed.name);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// scaleIngredient
// ---------------------------------------------------------------------------

/** Common fractions for nice display. */
const DISPLAY_FRACTIONS: [number, string][] = [
  [0.125, "1/8"],
  [0.25, "1/4"],
  [1 / 3, "1/3"],
  [0.375, "3/8"],
  [0.5, "1/2"],
  [2 / 3, "2/3"],
  [0.75, "3/4"],
  [0.875, "7/8"],
];

function formatQuantity(n: number): string {
  if (n <= 0) return "0";

  const whole = Math.floor(n);
  const frac = n - whole;

  // Check if fractional part is close to a display fraction
  if (frac > 0.01) {
    for (const [val, str] of DISPLAY_FRACTIONS) {
      if (Math.abs(frac - val) < 0.05) {
        return whole > 0 ? `${whole} ${str}` : str;
      }
    }
  }

  // Close to a whole number
  if (frac < 0.01) {
    return String(whole);
  }

  // Fall back to rounded decimal
  const rounded = Math.round(n * 100) / 100;
  // Remove trailing zeros
  return String(parseFloat(rounded.toFixed(2)));
}

/**
 * Scale a parsed ingredient by a ratio and return a formatted string.
 * If the ingredient has no quantity, returns the original string unchanged.
 * Includes the prep note (comma-separated) when present.
 */
export function scaleIngredient(
  parsed: ParsedIngredient,
  ratio: number,
): string {
  if (parsed.quantity === null) {
    return parsed.prepNote
      ? `${parsed.name}, ${parsed.prepNote}`
      : parsed.original;
  }

  const scaled = parsed.quantity * ratio;
  const qty = formatQuantity(scaled);

  const parts = [qty];
  if (parsed.unit) parts.push(parsed.unit);
  if (parsed.name) parts.push(parsed.name);

  const main = parts.join(" ");
  return parsed.prepNote ? `${main}, ${parsed.prepNote}` : main;
}

// ---------------------------------------------------------------------------
// parseServings
// ---------------------------------------------------------------------------

/**
 * Extract a numeric serving count from a servings string.
 *
 * Examples:
 *   "4"           → 4
 *   "6 servings"  → 6
 *   "Serves 4"    → 4
 *   "4-6"         → 4
 *   null          → null
 */
export function parseServings(
  servingsStr: string | null | undefined,
): number | null {
  if (!servingsStr) return null;
  const match = servingsStr.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return isNaN(n) || n <= 0 ? null : n;
}
