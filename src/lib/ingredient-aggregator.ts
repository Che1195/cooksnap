// ---------------------------------------------------------------------------
// Ingredient Aggregator — merge duplicate ingredients across recipes
//
// Used by the shopping list generator to combine "1 cup rice" + "2 cups rice"
// into "3 cups rice" instead of listing them as separate items.
// ---------------------------------------------------------------------------

import { parseIngredient, formatQuantity } from "./ingredient-parser";

// ---------------------------------------------------------------------------
// Unit normalization — map variants to a canonical form
// ---------------------------------------------------------------------------

const UNIT_ALIASES: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tsps: "tsp",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
  liter: "l",
  liters: "l",
  l: "l",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  bunch: "bunch",
  bunches: "bunch",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
  handful: "handful",
  package: "package",
  pkg: "package",
  pinch: "pinch",
  dash: "dash",
};

/** Normalize a unit string to its canonical form. Returns null if input is null. */
export function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  return UNIT_ALIASES[unit.toLowerCase()] ?? unit.toLowerCase();
}

// ---------------------------------------------------------------------------
// Unit conversion — only within the same measurement family
// ---------------------------------------------------------------------------

/** Conversion factors to a base unit within each family. */
const UNIT_TO_BASE: Record<string, { family: string; factor: number }> = {
  // Volume (base: tsp)
  tsp: { family: "volume", factor: 1 },
  tbsp: { family: "volume", factor: 3 },
  cup: { family: "volume", factor: 48 },
  // Weight imperial (base: oz)
  oz: { family: "weight-imperial", factor: 1 },
  lb: { family: "weight-imperial", factor: 16 },
  // Weight metric (base: g)
  g: { family: "metric-weight", factor: 1 },
  kg: { family: "metric-weight", factor: 1000 },
  // Volume metric (base: ml)
  ml: { family: "metric-volume", factor: 1 },
  l: { family: "metric-volume", factor: 1000 },
};

/** Check if two normalized units can be converted to each other. */
export function canConvertUnits(unitA: string, unitB: string): boolean {
  const a = UNIT_TO_BASE[unitA];
  const b = UNIT_TO_BASE[unitB];
  if (!a || !b) return false;
  return a.family === b.family;
}

/**
 * Convert a quantity from one unit to another within the same family.
 * Both units must be normalized. Returns the converted quantity.
 */
export function convertQuantity(qty: number, from: string, to: string): number {
  const fromInfo = UNIT_TO_BASE[from];
  const toInfo = UNIT_TO_BASE[to];
  if (!fromInfo || !toInfo || fromInfo.family !== toInfo.family) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }
  // Convert to base, then to target
  return (qty * fromInfo.factor) / toInfo.factor;
}

// ---------------------------------------------------------------------------
// Name normalization — grouping key for aggregation
// ---------------------------------------------------------------------------

/** Words that should NOT have trailing "s" stripped (would become nonsense). */
const NO_DEPLURALIZE = new Set([
  "hummus", "couscous", "asparagus", "citrus", "molasses", "quinoa",
  "harissa", "ricotta", "polenta", "tahini", "tzatziki",
]);

/**
 * Normalize an ingredient name for grouping.
 * Lowercases, trims, collapses whitespace, and strips basic plural "s".
 */
export function normalizeIngredientName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, " ");
  // Strip trailing "s" for basic plural normalization, but not for short words
  // or known exceptions
  if (n.length > 3 && n.endsWith("s") && !NO_DEPLURALIZE.has(n)) {
    // "tomatoes" → "tomato" (strip "es" after consonant+o)
    if (n.endsWith("oes")) {
      n = n.slice(0, -2);
    }
    // "berries" → "berry" (strip "ies", add "y")
    else if (n.endsWith("ies")) {
      n = n.slice(0, -3) + "y";
    }
    // "leaves" → "leaf" (strip "ves", add "f")
    else if (n.endsWith("ves")) {
      n = n.slice(0, -3) + "f";
    }
    // General: strip trailing "s"
    else {
      n = n.slice(0, -1);
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface ParsedEntry {
  quantity: number | null;
  normalizedUnit: string | null;
  displayUnit: string | null;
  normalizedName: string;
  displayName: string;
  prepNote: string | null;
  original: string;
}

/**
 * Pick the preferred unit when merging two entries with convertible but
 * different units. Prefers the unit with the larger factor (e.g., cup over tsp)
 * to keep numbers manageable.
 */
function preferredUnit(unitA: string, unitB: string): string {
  const a = UNIT_TO_BASE[unitA];
  const b = UNIT_TO_BASE[unitB];
  if (!a || !b) return unitA;
  return a.factor >= b.factor ? unitA : unitB;
}

/** Map from normalized unit back to a reasonable display form. */
const UNIT_DISPLAY: Record<string, string> = {
  tsp: "tsp",
  tbsp: "tbsp",
  cup: "cup",
  oz: "oz",
  lb: "lb",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  clove: "clove",
  can: "can",
  bunch: "bunch",
  slice: "slice",
  piece: "piece",
  head: "head",
  stalk: "stalk",
  sprig: "sprig",
  handful: "handful",
  package: "package",
  pinch: "pinch",
  dash: "dash",
};

/** Pluralize a unit display string when quantity > 1. */
function pluralizeUnit(unit: string, qty: number): string {
  if (qty <= 1) return unit;
  // Units that don't pluralize with simple "s"
  const irregulars: Record<string, string> = {
    bunch: "bunches",
    dash: "dashes",
    pinch: "pinches",
  };
  return irregulars[unit] ?? unit + "s";
}

/**
 * Aggregate a list of raw ingredient strings, merging duplicates by summing
 * quantities and converting compatible units.
 *
 * Section headers (lines starting with "## ") pass through unchanged.
 * Items with no quantity stay separate from items with quantities.
 */
export function aggregateIngredients(ingredients: string[]): string[] {
  if (ingredients.length === 0) return [];

  // Parse all ingredients
  const entries: ParsedEntry[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const raw = ingredients[i];
    // Skip section headers — callers should filter these, but guard here too
    if (raw.startsWith("## ")) continue;

    const parsed = parseIngredient(raw);
    entries.push({
      quantity: parsed.quantity,
      normalizedUnit: normalizeUnit(parsed.unit),
      displayUnit: parsed.unit,
      normalizedName: normalizeIngredientName(parsed.name),
      displayName: parsed.name,
      prepNote: parsed.prepNote,
      original: raw,
    });
  }

  // Group by normalized name
  const groups = new Map<string, ParsedEntry[]>();
  for (const entry of entries) {
    const key = entry.normalizedName;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(entry);
  }

  // Merge each group
  const result: string[] = [];

  for (const [, group] of groups) {
    // Separate quantified from unquantified entries
    const withQty = group.filter((e) => e.quantity !== null);
    const withoutQty = group.filter((e) => e.quantity === null);

    // Merge quantified entries
    if (withQty.length > 0) {
      const merged = mergeQuantifiedEntries(withQty);
      result.push(merged);
    }

    // Deduplicate unquantified entries (keep first occurrence)
    if (withoutQty.length > 0) {
      // Only add if there are no quantified entries for this name
      if (withQty.length === 0) {
        result.push(withoutQty[0].original);
      } else {
        // Keep unquantified separate — they're different ("salt to taste" vs "1 tsp salt")
        result.push(withoutQty[0].original);
      }
    }
  }

  return result;
}

/**
 * Merge a group of quantified entries (same normalized name) into one line.
 * Handles unit conversion within the same family.
 */
function mergeQuantifiedEntries(entries: ParsedEntry[]): string {
  // Group by normalized unit
  const unitGroups = new Map<string | null, ParsedEntry[]>();
  for (const e of entries) {
    const key = e.normalizedUnit;
    let group = unitGroups.get(key);
    if (!group) {
      group = [];
      unitGroups.set(key, group);
    }
    group.push(e);
  }

  // Try to merge across convertible unit groups
  const mergedBuckets: { qty: number; unit: string | null; displayUnit: string | null }[] = [];
  const usedKeys = new Set<string | null>();

  const unitKeys = [...unitGroups.keys()];

  for (let i = 0; i < unitKeys.length; i++) {
    const keyA = unitKeys[i];
    if (usedKeys.has(keyA)) continue;

    let totalQty = sumQuantities(unitGroups.get(keyA)!);
    let bestUnit = keyA;
    usedKeys.add(keyA);

    // Try to merge with other unit groups in the same family
    for (let j = i + 1; j < unitKeys.length; j++) {
      const keyB = unitKeys[j];
      if (usedKeys.has(keyB)) continue;
      if (keyA && keyB && canConvertUnits(keyA, keyB)) {
        const preferred = preferredUnit(keyA, keyB);
        const other = preferred === keyA ? keyB : keyA;
        // Convert current total to preferred unit if needed
        if (bestUnit !== preferred && bestUnit && preferred) {
          totalQty = convertQuantity(totalQty, bestUnit, preferred);
        }
        // Add converted quantity from the other group
        const otherQty = sumQuantities(unitGroups.get(keyB)!);
        totalQty += convertQuantity(otherQty, other, preferred);
        bestUnit = preferred;
        usedKeys.add(keyB);
      }
    }

    // Also handle the case where bestUnit changed mid-loop
    const displayUnit = bestUnit ? (UNIT_DISPLAY[bestUnit] ?? bestUnit) : null;
    mergedBuckets.push({ qty: totalQty, unit: bestUnit, displayUnit });
  }

  // Use the display name from the first entry
  const displayName = entries[0].displayName;

  // Collect and deduplicate prep notes
  const notes = new Set<string>();
  for (const e of entries) {
    if (e.prepNote) notes.add(e.prepNote);
  }
  const prepNote = notes.size > 0 ? [...notes].join(" / ") : null;

  // Build the result string
  if (mergedBuckets.length === 1) {
    return formatMergedLine(mergedBuckets[0].qty, mergedBuckets[0].displayUnit, displayName, prepNote);
  }

  // Multiple incompatible unit buckets — format each and join with " + "
  const parts = mergedBuckets.map((b) =>
    formatMergedLine(b.qty, b.displayUnit, "", null).trim()
  );
  const qtyPart = parts.join(" + ");
  const main = `${qtyPart} ${displayName}`;
  return prepNote ? `${main}, ${prepNote}` : main;
}

/** Sum quantities for a group of entries (all same normalized unit). */
function sumQuantities(entries: ParsedEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
}

/** Format a single merged ingredient line. */
function formatMergedLine(
  qty: number,
  displayUnit: string | null,
  name: string,
  prepNote: string | null,
): string {
  const qtyStr = formatQuantity(qty);
  const parts = [qtyStr];
  if (displayUnit) {
    parts.push(pluralizeUnit(displayUnit, qty));
  }
  if (name) parts.push(name);
  const main = parts.join(" ");
  return prepNote ? `${main}, ${prepNote}` : main;
}
