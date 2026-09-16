import { z } from "zod";

const spanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1).max(2000),
});
const quantitySchema = spanSchema.extend({
  role: z.enum(["amount", "package", "equivalent"]),
  value: z.number().finite().nonnegative().max(1_000_000_000),
  max: z.number().finite().nonnegative().max(1_000_000_000).optional(),
});
export const interpretationSchema = z.object({
  version: z.literal(1),
  sourceFingerprint: z.string().max(100),
  ingredients: z
    .array(
      z.object({
        id: z.string().min(1).max(2000),
        index: z.number().int().nonnegative(),
        name: z.string().min(1).max(2000),
        aliases: z.array(z.string().min(1).max(2000)).max(50),
        nameSpan: spanSchema.optional(),
        quantities: z.array(quantitySchema).max(100),
      }),
    )
    .max(500),
  instructions: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        references: z
          .array(spanSchema.extend({ ingredientId: z.string().max(2000) }))
          .max(500),
        quantities: z
          .array(quantitySchema.extend({ ingredientId: z.string().max(2000) }))
          .max(100),
      }),
    )
    .max(500),
});
export type RecipeInterpretation = z.infer<typeof interpretationSchema>;
export interface RecipeSource {
  ingredients: string[];
  instructions: string[];
  servings?: string | null;
}
type Span = z.infer<typeof spanSchema>;
type Quantity = z.infer<typeof quantitySchema>;
type Ingredient = RecipeInterpretation["ingredients"][number];
type Reference =
  RecipeInterpretation["instructions"][number]["references"][number];

/** Exact source text and array ordering participate in the browser-safe versioned hash. */
export function recipeFingerprint(source: RecipeSource): string {
  const text = JSON.stringify([
    source.ingredients,
    source.instructions,
    source.servings ?? null,
  ]);
  let a = 2166136261;
  let b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 3266489917);
  }
  return `v1:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${text.length}`;
}
const fractions: Record<string, number> = {
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
const atom =
  "(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|(?:\\d+\\s*)?[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|(?:\\d+(?:\\.\\d+)?|\\.\\d+))";
const numericPattern = `${atom}(?:\\s*(?:[-–—]|to)\\s*${atom})?`;
const measure =
  "(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|cans?|packages?|jars?|bottles?|slices?|pieces?|heads?|stalks?|sprigs?|bunch(?:es)?)";
const unitPrefix = new RegExp(`^\\s*(${measure})(?![a-z])\\.?`, "i");
const packagePrefix =
  /^\s*(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\b/i;
function numberValue(text: string): number {
  const unicode = text.match(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]$/);
  if (unicode)
    return Number(text.slice(0, -1).trim() || 0) + fractions[unicode[0]];
  const mixed = text.match(/^(?:(\d+)\s+)?(\d+)\s*[/⁄]\s*(\d+)$/);
  if (mixed) return Number(mixed[1] ?? 0) + Number(mixed[2]) / Number(mixed[3]);
  return Number(text);
}
function values(text: string): { value: number; max?: number } | undefined {
  if (!new RegExp(`^${numericPattern}$`).test(text)) return;
  const parts = text.split(/\s*(?:[-–—]|to)\s*/);
  const value = numberValue(parts[0]);
  const max = parts[1] === undefined ? undefined : numberValue(parts[1]);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (max !== undefined && (!Number.isFinite(max) || max < value))
  )
    return;
  return { value, ...(max === undefined ? {} : { max }) };
}
function quantity(
  match: RegExpExecArray,
  role: Quantity["role"],
): Quantity | undefined {
  const parsed = values(match[0]);
  return parsed
    ? {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        role,
        ...parsed,
      }
    : undefined;
}
function ingredientQuantities(text: string): Quantity[] {
  if (text.trimStart().startsWith("##")) return [];
  const leading = new RegExp(`^\\s*(${numericPattern})`).exec(text);
  if (!leading) return [];
  const start = leading[0].indexOf(leading[1]);
  const parsed = values(leading[1]);
  if (!parsed) return [];
  const first: Quantity = {
    start,
    end: start + leading[1].length,
    text: leading[1],
    role: "amount",
    ...parsed,
  };
  // Refuse dimensions, temperatures, percentages, and prose quantities.
  if (
    /^\s*[-‐–—]?\s*(?:inches?\b|inch\b|cm\b|mm\b|degrees?\b|percent\b|°|%|["″])/i.test(text.slice(first.end))
  )
    return [];
  const remainder = text.slice(first.end);
  // A comma-grouped amount must never be treated as its first digit alone.
  if (/^,\d/.test(remainder)) return [];
  const packageSize =
    /^\s*[-‐]?\s*(?:ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l)\s+(?:\([^)]*\)\s*)?(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\b/i;
  if (packageSize.test(remainder)) first.role = "package";
  const result = [first];
  // Publisher equivalents may follow the ingredient name, not just its unit.
  // Parse only complete measured entries; preparation notes, temperatures, and
  // dimensions cannot supply a quantity merely because they contain digits.
  for (const parenthetical of remainder.matchAll(/\(([^()]*)\)/g)) {
    const content = parenthetical[1];
    const entries: Quantity[] = [];
    const role =
      first.role === "package" ||
      packagePrefix.test(remainder) ||
      packagePrefix.test(
        remainder.slice(parenthetical.index + parenthetical[0].length),
      ) ||
      /\beach\b/i.test(content)
        ? "package"
        : "equivalent";
    let offset = 0;
    for (const part of content.split(",")) {
      const match = new RegExp(`^\\s*(${numericPattern})`).exec(part);
      const unit = match && unitPrefix.exec(part.slice(match[0].length));
      const tail = unit
        ? part.slice((match?.[0].length ?? 0) + unit[0].length)
        : "";
      if (
        !match ||
        !unit ||
        !/^\s*(?:(?:each|diced|chopped|sliced|grated|minced|packed|sifted)\s*)*$/i.test(
          tail,
        )
      ) {
        entries.length = 0;
        break;
      }
      const parsed = values(match[1]);
      if (!parsed) {
        entries.length = 0;
        break;
      }
      const entryStart =
        first.end +
        parenthetical.index +
        1 +
        offset +
        match[0].indexOf(match[1]);
      entries.push({
        start: entryStart,
        end: entryStart + match[1].length,
        text: match[1],
        role,
        ...parsed,
      });
      offset += part.length + 1;
    }
    result.push(...entries);
  }
  // Slash-separated measurements are equivalents only when both sides name a
  // measurement unit. The slash in a fraction remains part of numericPattern.
  const slash = new RegExp(
    `^\\s*${measure}\\.?\\s*/\\s*(${numericPattern})\\s*(${measure})(?![a-z])`,
    "i",
  ).exec(remainder);
  if (slash) {
    const parsed = values(slash[1]);
    const entryStart =
      first.end +
      slash[0].indexOf("/") +
      1 +
      slash[0].slice(slash[0].indexOf("/") + 1).indexOf(slash[1]);
    if (parsed)
      result.push({
        start: entryStart,
        end: entryStart + slash[1].length,
        text: slash[1],
        role:
          packagePrefix.test(remainder) ||
          packagePrefix.test(remainder.slice(slash[0].length))
            ? "package"
            : "equivalent",
        ...parsed,
      });
    if (packagePrefix.test(remainder.slice(slash[0].length)))
      first.role = "package";
  }
  return result;
}
function normalized(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.endsWith("ies")
        ? `${word.slice(0, -3)}y`
        : word.endsWith("s") && !word.endsWith("ss")
          ? word.slice(0, -1)
          : word,
    )
    .join(" ");
}
function inferIngredient(text: string, index: number): Ingredient {
  const quantities = ingredientQuantities(text);
  let start = quantities[0]?.end ?? 0;
  if (quantities[0]?.role === "package") {
    const size =
      /^\s*[-‐]?\s*[a-z]+\s+(?:\([^)]*\)\s*)?(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\s*/i.exec(
        text.slice(start),
      );
    start += size?.[0].length ?? 0;
  }
  const prefix = /^(?:\s*\([^)]*\))?/.exec(text.slice(start));
  start += prefix?.[0].length ?? 0;
  const unit = unitPrefix.exec(text.slice(start));
  start += unit?.[0].length ?? 0;
  const slashEquivalent = new RegExp(
    `^\\s*/\\s*${numericPattern}\\s*${measure}(?![a-z])\\.?`,
    "i",
  ).exec(text.slice(start));
  start += slashEquivalent?.[0].length ?? 0;
  const equivalent = /^\s*\([^)]*\)/.exec(text.slice(start));
  start += equivalent?.[0].length ?? 0;
  const tail = text.slice(start).replace(/^\s*[-–—]?\s*/, "");
  start = text.length - tail.length;
  const name = tail
    .split(/[,;(]|\b(?:to taste|as needed|plus more|divided)\b/i)[0]
    .trim();
  const words = name.split(/\s+/);
  const aliases = [name];
  // Only use source-derived suffixes; no global ingredient dictionary.
  if (words.length > 1 && words[words.length - 1].length > 2)
    aliases.push(words[words.length - 1]);
  return {
    id: `ingredient-${index}`,
    index,
    name: name || text,
    aliases: aliases.filter(Boolean),
    ...(name
      ? { nameSpan: { start, end: start + name.length, text: name } }
      : {}),
    quantities,
  };
}
function references(text: string, ingredients: Ingredient[]): Reference[] {
  const candidates: Reference[] = [];
  for (const ingredient of ingredients)
    for (const alias of [ingredient.name, ...ingredient.aliases]) {
      const base = normalized(alias);
      if (!base || base.length < 2) continue;
      const pattern = base
        .split(" ")
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?")
        .join("\\s+");
      for (const match of text.matchAll(new RegExp(`\\b${pattern}\\b`, "gi"))) {
        const start = match.index;
        // "Oil a pan" uses oil as a verb. Never match words inside foil or boiling.
        if (
          base === "oil" &&
          /^\s*(?:a|an|the|your)\s+(?:pan|dish|tin|tray|skillet)\b/i.test(
            text.slice(start + match[0].length),
          )
        )
          continue;
        candidates.push({
          start,
          end: start + match[0].length,
          text: match[0],
          ingredientId: ingredient.id,
        });
      }
    }
  const result: Reference[] = [];
  for (const candidate of candidates.sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )) {
    if (result.some((span) => overlaps(span, candidate))) continue;
    const owners = new Set(
      candidates
        .filter(
          (other) =>
            other.start === candidate.start && other.end === candidate.end,
        )
        .map((other) => other.ingredientId),
    );
    if (owners.size === 1) result.push(candidate);
  }
  return result;
}
function stepQuantities(
  text: string,
  refs: Reference[],
): RecipeInterpretation["instructions"][number]["quantities"] {
  const result: RecipeInterpretation["instructions"][number]["quantities"] = [];
  for (const match of text.matchAll(new RegExp(numericPattern, "g"))) {
    const end = match.index + match[0].length;
    if (
      /[\d,./]/.test(text[match.index - 1] ?? "") ||
      /^,\d/.test(text.slice(end))
    )
      continue;
    const unit = unitPrefix.exec(text.slice(end));
    const unitEnd = end + (unit?.[0].length ?? 0);
    const ref = refs.find(
      (ref) =>
        ref.start >= unitEnd &&
        ref.start - end < 50 &&
        /^\s*(?:of\s+(?:the\s+)?)?$/i.test(text.slice(unitEnd, ref.start)),
    );
    if (
      !ref ||
      /\b(?:remaining|half|quarter|rest)\s*(?:of\s*)?$/i.test(
        text.slice(Math.max(0, match.index - 25), match.index),
      )
    )
      continue;
    // In "2 packages of 8 oz cream cheese", 8 is a fixed package size.
    // Leave the distant count alone rather than guessing its relationship.
    const packageSize =
      /\b(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\s+of\s*(?:the\s+)?$/i.test(
        text.slice(0, match.index),
      );
    const entry = quantity(match, packageSize ? "package" : "amount");
    // Fractions of an ingredient are proportions, unlike measured fractions
    // such as "1/2 cup of butter" or counted amounts such as "2 of the eggs".
    if (
      entry &&
      !unit &&
      (entry.max ?? entry.value) <= 1 &&
      /^\s*of\b/i.test(text.slice(end))
    )
      continue;
    if (entry) result.push({ ...entry, ingredientId: ref.ingredientId });
  }
  return result;
}
function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}
function validSpans(text: string, spans: Span[]): boolean {
  return spans.every(
    (span, i) =>
      span.end > span.start &&
      span.end <= text.length &&
      text.slice(span.start, span.end) === span.text &&
      !spans.slice(i + 1).some((other) => overlaps(span, other)),
  );
}
function validNumbers(spans: Quantity[], allowed: Quantity[]): boolean {
  return spans.every((span) => {
    const parsed = values(span.text);
    return (
      parsed &&
      Math.abs(parsed.value - span.value) < 1e-9 &&
      (parsed.max === undefined
        ? span.max === undefined
        : span.max !== undefined && Math.abs(parsed.max - span.max) < 1e-9) &&
      allowed.some(
        (candidate) =>
          candidate.start === span.start &&
          candidate.end === span.end &&
          candidate.role === span.role,
      )
    );
  });
}
/** All semantic claims are optional. Reject stale, malformed, or unsupported annotations together. */
export function validateInterpretation(
  source: RecipeSource,
  value: unknown,
): RecipeInterpretation | undefined {
  const parsed = interpretationSchema.safeParse(value);
  if (!parsed.success) return;
  const data = parsed.data;
  if (data.sourceFingerprint !== recipeFingerprint(source)) return;
  if (
    new Set(data.ingredients.map((item) => item.id)).size !==
      data.ingredients.length ||
    new Set(data.ingredients.map((item) => item.index)).size !==
      data.ingredients.length ||
    new Set(data.instructions.map((item) => item.index)).size !==
      data.instructions.length
  )
    return;
  for (const item of data.ingredients) {
    const text = source.ingredients[item.index];
    if (text === undefined) return;
    const identity = item.nameSpan?.text ?? item.name;
    if (
      !` ${normalized(text)} `.includes(` ${normalized(identity)} `) ||
      !normalized(identity) ||
      !` ${normalized(identity)} `.includes(` ${normalized(item.name)} `)
    )
      return;
    if (
      item.aliases.some(
        (alias) =>
          !normalized(alias) ||
          !` ${normalized(identity)} `.includes(` ${normalized(alias)} `),
      )
    )
      return;
    if (
      !validSpans(text, [
        ...item.quantities,
        ...(item.nameSpan ? [item.nameSpan] : []),
      ]) ||
      !validNumbers(item.quantities, ingredientQuantities(text))
    )
      return;
  }
  for (const item of data.instructions) {
    const text = source.instructions[item.index];
    if (
      text === undefined ||
      !validSpans(text, [...item.references, ...item.quantities])
    )
      return;
    const allowedRefs = references(text, data.ingredients);
    if (
      item.references.some(
        (ref) =>
          !allowedRefs.some(
            (candidate) =>
              candidate.start === ref.start &&
              candidate.end === ref.end &&
              candidate.ingredientId === ref.ingredientId,
          ),
      )
    )
      return;
    const allowed = stepQuantities(text, item.references);
    if (
      !validNumbers(item.quantities, allowed) ||
      item.quantities.some(
        (entry) =>
          !allowed.some(
            (candidate) =>
              candidate.start === entry.start &&
              candidate.ingredientId === entry.ingredientId,
          ),
      )
    )
      return;
  }
  return data;
}
const semanticSchema = z
  .object({
    ingredients: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            name: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    references: z
      .array(
        z
          .object({
            step: z.number().int().nonnegative(),
            ingredient: z.number().int().nonnegative(),
            text: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(2500),
  })
  .strict();

/** The model selects literal references; identities, offsets, and measurements are local. */
export function buildSemanticInterpretation(
  source: RecipeSource,
  semantics: {
    ingredients?: Array<{ index: number; name: string }>;
    references: Array<{ step: number; ingredient: number; text: string }>;
  },
  options: { onUnsupportedReference?: () => void } = {},
): RecipeInterpretation | undefined {
  const parsed = semanticSchema.safeParse(semantics);
  if (!parsed.success) return;
  const claims = parsed.data;
  const inferred = source.ingredients.map(inferIngredient);
  const ingredientClaims =
    claims.ingredients ?? inferred.map(({ index, name }) => ({ index, name }));
  if (
    ingredientClaims.length !== source.ingredients.length ||
    new Set(ingredientClaims.map((item) => item.index)).size !==
      source.ingredients.length
  )
    return;
  const ingredients: Ingredient[] = [];
  for (const claim of ingredientClaims) {
    const original = source.ingredients[claim.index];
    const base = inferred[claim.index];
    if (original === undefined || !base) return;
    const start = original.indexOf(claim.name);
    // Names cannot move identity into a unit, package size, or preparation note.
    if (
      start < 0 ||
      !normalized(claim.name) ||
      !` ${normalized(base.name)} `.includes(` ${normalized(claim.name)} `)
    )
      return;
    ingredients.push({
      ...base,
      name: claim.name,
      nameSpan: base.nameSpan ?? {
        start,
        end: start + claim.name.length,
        text: claim.name,
      },
      aliases: [...new Set([base.name, ...base.aliases, claim.name])],
    });
  }
  ingredients.sort((a, b) => a.index - b.index);
  const instructions = source.instructions.map((_, index) => ({
    index,
    references: [] as Reference[],
    quantities:
      [] as RecipeInterpretation["instructions"][number]["quantities"],
  }));
  // Enrich only with source-supported phrases. Check ownership against every
  // original identity, including rows whose semantic name selects another phrase.
  const omitUnsupported = (): boolean => {
    if (!options.onUnsupportedReference) return false;
    options.onUnsupportedReference();
    return true;
  };
  const resolvedClaims: Array<{
    step: number;
    ingredient: number;
    text: string;
    starts: Set<number>;
  }> = [];
  for (const claim of claims.references) {
    const ingredient = ingredients[claim.ingredient];
    const instruction = source.instructions[claim.step];
    if (
      !ingredient ||
      instruction === undefined ||
      !instruction.includes(claim.text)
    ) {
      if (!omitUnsupported()) return;
      continue;
    }
    let text = claim.text;
    const ownersOf = (phrase: string) => {
      const identity = normalized(phrase);
      return inferred.filter(
        (item) =>
          identity && ` ${normalized(item.name)} `.includes(` ${identity} `),
      );
    };
    let owners = ownersOf(text);
    // Preserve full identities first. Only known preparation prefixes may be
    // removed from an exact instruction quotation to reveal its literal core.
    if (!owners.length) {
      const prefix =
        /^(?:(?:finely|roughly|coarsely|thinly|freshly)\s+)?(?:chopped|diced|grated|minced|sliced|shredded|crushed|peeled)\s+/i.exec(
          text,
        );
      if (!prefix) {
        if (!omitUnsupported()) return;
        continue;
      }
      text = text.slice(prefix[0].length);
      owners = ownersOf(text);
    }
    if (owners.length !== 1 || owners[0].id !== ingredient.id) {
      if (!omitUnsupported()) return;
      continue;
    }
    if (!ingredient.aliases.includes(text) && ingredient.aliases.length >= 50) {
      if (!omitUnsupported()) return;
      continue;
    }
    const starts = new Set<number>();
    for (
      let position = instruction.indexOf(claim.text);
      position >= 0;
      position = instruction.indexOf(claim.text, position + claim.text.length)
    ) {
      starts.add(position + claim.text.length - text.length);
    }
    resolvedClaims.push({
      step: claim.step,
      ingredient: claim.ingredient,
      text,
      starts,
    });
    if (!ingredient.aliases.includes(text)) ingredient.aliases.push(text);
  }
  const supported = source.instructions.map((text) =>
    references(text, ingredients),
  );
  const seen = new Set<string>();
  for (const claim of resolvedClaims) {
    const instruction = instructions[claim.step];
    const ingredient = ingredients[claim.ingredient];
    if (!instruction || !ingredient) {
      if (!omitUnsupported()) return;
      continue;
    }
    const key = JSON.stringify([
      claim.step,
      claim.ingredient,
      claim.text,
      [...claim.starts],
    ]);
    if (seen.has(key)) {
      if (!omitUnsupported()) return;
      continue;
    }
    seen.add(key);
    const candidates = supported[claim.step].filter(
      (ref) =>
        ref.text === claim.text &&
        ref.ingredientId === ingredient.id &&
        claim.starts.has(ref.start),
    );
    if (
      !candidates.length ||
      candidates.some((candidate) =>
        instruction.references.some((ref) => overlaps(ref, candidate)),
      )
    ) {
      if (!omitUnsupported()) return;
      continue;
    }
    // One literal claim covers its supported occurrences, never guessed offsets.
    instruction.references.push(...candidates);
  }
  for (const instruction of instructions) {
    instruction.references.sort((a, b) => a.start - b.start);
    instruction.quantities = stepQuantities(
      source.instructions[instruction.index],
      instruction.references,
    );
  }
  return validateInterpretation(source, {
    version: 1,
    sourceFingerprint: recipeFingerprint(source),
    ingredients,
    instructions,
  });
}

export function formatRecipeQuantity(value: number): string {
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (Math.abs(value - Math.round(value)) < 1e-8)
    return String(Math.round(value));
  for (const denominator of [2, 3, 4, 8, 6, 5, 16]) {
    const numerator = Math.round(fraction * denominator);
    if (
      numerator > 0 &&
      numerator < denominator &&
      Math.abs(fraction - numerator / denominator) < 1e-8
    )
      return `${whole ? `${whole} ` : ""}${numerator}/${denominator}`;
  }
  return String(Number(value.toPrecision(12)));
}
function replaceQuantities(
  text: string,
  quantities: Quantity[],
  ratio: number,
): string {
  let result = text;
  for (const entry of [...quantities].sort((a, b) => b.start - a.start)) {
    if (entry.role === "package") continue;
    const replacement =
      entry.max === undefined
        ? formatRecipeQuantity(entry.value * ratio)
        : `${formatRecipeQuantity(entry.value * ratio)}${entry.text.match(/\s*(?:[-–—]|to)\s*/)?.[0] ?? "-"}${formatRecipeQuantity(entry.max * ratio)}`;
    const suffix = result.slice(entry.end);
    const unit =
      /^(\s*(?:\([^)]*\)\s*)?)(cups?|tablespoons?|teaspoons?|ounces?|pounds?|grams?|kilograms?|milliliters?|liters?|cloves?|cans?|packages?|jars?|bottles?|slices?|pieces?|heads?|stalks?|sprigs?)(?![a-z])/i.exec(
        suffix,
      );
    let tail = suffix;
    if (unit) {
      const singular = unit[2].replace(/s$/i, "");
      const word =
        entry.max === undefined && entry.value * ratio <= 1 + 1e-8
          ? singular
          : `${singular}s`;
      tail = unit[1] + word + suffix.slice(unit[0].length);
    }
    result = result.slice(0, entry.start) + replacement + tail;
  }
  return result;
}
const physicalMeasurePrefix =
  /^\s*[-‐]?\s*(?:cups?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l)(?![a-z])\.?/i;

function hasUnresolvedMeasurement(
  text: string,
  quantities: Quantity[],
): boolean {
  for (const match of text.matchAll(new RegExp(numericPattern, "g"))) {
    const end = match.index + match[0].length;
    const unit = physicalMeasurePrefix.exec(text.slice(end));
    if (!unit) continue;
    if (
      quantities.some(
        (entry) => entry.start === match.index && entry.end === end,
      )
    )
      continue;
    const afterUnit = text.slice(end + unit[0].length);
    // Fixed package sizes are deliberately unchanged, not incomplete scaling.
    if (
      packagePrefix.test(afterUnit) ||
      /^\s*\([^)]*\)\s*(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\b/i.test(
        afterUnit,
      ) ||
      /\b(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\s+of\s*(?:the\s+)?$/i.test(
        text.slice(0, match.index),
      )
    )
      continue;
    const opening = text.lastIndexOf("(", match.index);
    const closing = text.indexOf(")", end);
    if (
      opening >= 0 &&
      closing >= 0 &&
      !text.slice(opening + 1, match.index).includes(")")
    ) {
      const content = text.slice(opening + 1, closing);
      if (
        /\beach\b/i.test(content) ||
        packagePrefix.test(text.slice(closing + 1)) ||
        new RegExp(
          `^\\s*${numericPattern}\\s*(?:cans?|packages?|jars?|bottles?|bags?|boxes?|packets?)\\b`,
          "i",
        ).test(text)
      )
        continue;
    }
    return true;
  }
  return false;
}

/** Report partial scaling without changing interpretation acceptance or source text. */
export function incompleteMeasurementWarnings(
  source: RecipeSource,
  interpretation?: unknown,
): string[] {
  const metadata = validateInterpretation(source, interpretation);
  const ingredients = source.ingredients.map((text, index) => ({
    ...(metadata?.ingredients.find((item) => item.index === index) ??
      inferIngredient(text, index)),
    quantities: ingredientQuantities(text),
  }));
  const unresolvedIngredient = ingredients.some((item) =>
    hasUnresolvedMeasurement(source.ingredients[item.index], item.quantities),
  );
  const unresolvedStep = source.instructions.some((text, index) => {
    const refs =
      metadata?.instructions.find((item) => item.index === index)?.references ??
      references(text, ingredients);
    const selected = stepQuantities(text, refs);
    const supported = stepQuantities(text, references(text, ingredients));
    const omittedAmount = supported.some(
      (entry) =>
        entry.role !== "package" &&
        !selected.some(
          (quantity) =>
            quantity.start === entry.start &&
            quantity.end === entry.end &&
            quantity.ingredientId === entry.ingredientId,
        ),
    );
    return omittedAmount || hasUnresolvedMeasurement(text, selected);
  });
  const writtenAlternative = ingredients.some((item) => {
    const text = source.ingredients[item.index];
    return Array.from(
      text.matchAll(
        /\bor\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s*\([^)]*\)/gi,
      ),
    ).some((match) =>
      item.quantities.some(
        (entry) =>
          entry.role !== "package" &&
          entry.start >= match.index &&
          entry.end <= match.index + match[0].length,
      ),
    );
  });
  const warnings: string[] = [];
  if (unresolvedIngredient || unresolvedStep)
    warnings.push(
      "Some measured amounts cannot be scaled automatically. Check ingredient and instruction quantities when changing servings.",
    );
  if (writtenAlternative)
    warnings.push(
      "Written ingredient counts remain unchanged while their measured equivalents scale. Check alternative ingredient amounts when changing servings.",
    );
  return warnings;
}

/** Project display text without modifying stored source, including at the original serving count. */
export function projectRecipe(
  source: RecipeSource & { interpretation?: unknown },
  ratio: number,
): {
  ingredients: string[];
  instructions: Array<{
    text: string;
    highlights: Array<{ start: number; end: number }>;
  }>;
  warnings: string[];
} {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const metadata = validateInterpretation(source, source.interpretation);
  const ingredients = source.ingredients.map((text, index) => {
    const annotation = metadata?.ingredients.find(
      (item) => item.index === index,
    );
    return annotation
      ? { ...annotation, quantities: ingredientQuantities(text) }
      : inferIngredient(text, index);
  });
  const warnings: string[] =
    safeRatio === 1 ? [] : incompleteMeasurementWarnings(source, metadata);
  if (safeRatio !== ratio)
    warnings.push("The serving multiplier must be a positive finite number.");
  if (source.interpretation && !metadata)
    warnings.push(
      "Recipe text changed or interpretation was invalid. Using source-based amounts.",
    );
  if (
    safeRatio !== 1 &&
    ingredients.some(
      (item) =>
        !item.quantities.some((quantity) => quantity.role !== "package") &&
        !source.ingredients[item.index].trimStart().startsWith("##"),
    )
  )
    warnings.push(
      "Amounts without a clear scalable quantity remain unchanged.",
    );
  return {
    ingredients: source.ingredients.map((text, index) =>
      safeRatio === 1
        ? text
        : replaceQuantities(text, ingredients[index].quantities, safeRatio),
    ),
    instructions: source.instructions.map((original, index) => {
      const annotation = metadata?.instructions.find(
        (item) => item.index === index,
      );
      const refs = annotation?.references ?? references(original, ingredients);
      // Optional quantity annotations may be incomplete. Recover source amounts
      // only for the references selected by the validated interpretation.
      const quantities = stepQuantities(original, refs);
      if (
        safeRatio !== 1 &&
        quantities.some((entry) => entry.role === "package")
      ) {
        const warning =
          "Package amounts in instructions remain unchanged. Check their counts for the selected servings.";
        if (!warnings.includes(warning)) warnings.push(warning);
      }
      const text =
        safeRatio === 1
          ? original
          : replaceQuantities(original, quantities, safeRatio);
      // Each prefix receives the same numeric/unit edits as the complete sentence.
      // Preserve validated AI reference choices, including intentional exclusions.
      const highlights = refs.map((ref) => {
        const start =
          safeRatio === 1
            ? ref.start
            : replaceQuantities(
                original.slice(0, ref.start),
                quantities.filter((entry) => entry.end <= ref.start),
                safeRatio,
              ).length;
        return { start, end: start + ref.text.length };
      });
      return { text, highlights };
    }),
    warnings,
  };
}
