import * as cheerio from "cheerio";
import { decodeHTML } from "entities";
import type { ScrapedRecipe } from "@/types";

/**
 * Decodes all HTML entities in a string (named, numeric, and hex).
 * Uses the 'entities' library (already a cheerio dependency) to handle
 * every entity — e.g. &amp; → &, &#8243; → ″, &#x27; → ', etc.
 */
function decodeEntities(text: string): string {
  return decodeHTML(text);
}

// ---------------------------------------------------------------------------
// Section header detection — marks ingredient subheadings with "## " prefix
// ---------------------------------------------------------------------------

/** Common measurement units that indicate an actual ingredient, not a header. */
const UNIT_PATTERN =
  /\d+\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|l|pinch|dash|cloves?|cans?|bunch|slices?|pieces?|heads?|stalks?|sprigs?|handful|package|pkg)\b/i;

/**
 * Common prefixes that indicate section headers even without a trailing colon
 * — e.g. "For the sauce", "For the marinade", "For serving".
 */
const HEADER_PREFIX_PATTERN = /^for\s+(the\s+)?/i;

/**
 * Detects section headers in an ingredient list and prefixes them with "## ".
 * Section headers are items that:
 *   1. End with ":" and contain no quantities/units, OR
 *   2. Start with "For the..." / "For ..." and are short, non-ingredient text
 * Examples: "For the sauce:", "Marinade:", "Chicken:", "For the Topping"
 */
export function detectAndMarkSectionHeaders(ingredients: string[]): string[] {
  return ingredients.map((item) => {
    const trimmed = item.trim();
    // Already marked
    if (trimmed.startsWith("## ")) return trimmed;
    // Must be relatively short (headers are typically <60 chars)
    if (trimmed.length > 80) return trimmed;
    // Must NOT contain quantities + measurement units (that's a real ingredient)
    if (UNIT_PATTERN.test(trimmed)) return trimmed;
    // Must NOT start with a digit (e.g. "3 cloves garlic:" is not a header)
    if (/^\d/.test(trimmed)) return trimmed;

    // Rule 1: ends with ":"
    if (trimmed.endsWith(":")) return `## ${trimmed}`;

    // Rule 2: starts with "For the..." / "For ..." and is short (likely a section label)
    if (HEADER_PREFIX_PATTERN.test(trimmed) && trimmed.length <= 50) {
      return `## ${trimmed}:`;
    }

    return trimmed;
  });
}

/**
 * Extracts ingredient group headers from HTML structure (e.g. WPRM, Tasty plugins).
 * Returns an array of { header, count } where count is the number of ingredients
 * in that group, or null if no grouped structure is found.
 */
function extractIngredientGroupHeaders(
  $: cheerio.CheerioAPI,
): { header: string; count: number }[] | null {
  const groupSelectors = [
    { container: ".wprm-recipe-ingredient-group", header: ".wprm-recipe-group-name", items: "li" },
    { container: ".tasty-recipe-ingredient-group", header: ".tasty-recipe-ingredient-group-title", items: "li" },
    { container: ".ingredient-group", header: ".ingredient-group-title, .ingredient-group-name, h3, h4", items: "li" },
    { container: '[class*="ingredient-group"]', header: '[class*="group-name"], [class*="group-title"], h3, h4', items: "li" },
  ];

  for (const { container, header, items } of groupSelectors) {
    const groups = $(container);
    if (groups.length < 2) continue; // Need at least 2 groups for it to be meaningful

    const result: { header: string; count: number }[] = [];
    groups.each((_, groupEl) => {
      const headerEl = $(groupEl).find(header).first();
      const headerText = headerEl.text().trim();
      const itemCount = $(groupEl).find(items).length;
      if (headerText && itemCount > 0) {
        result.push({ header: headerText, count: itemCount });
      }
    });

    if (result.length >= 2) return result;
  }

  return null;
}

/**
 * Merges ingredient group headers into a flat ingredient list based on item counts.
 * The headers array specifies each group's name and how many ingredients it contains.
 * Headers are inserted at the correct positions in the flat list as "## Header:" entries.
 */
function mergeGroupHeaders(
  flatIngredients: string[],
  headers: { header: string; count: number }[],
): string[] {
  const result: string[] = [];
  let flatIdx = 0;

  for (const { header, count } of headers) {
    const headerText = header.endsWith(":") ? header : `${header}:`;
    result.push(`## ${headerText}`);
    for (let i = 0; i < count && flatIdx < flatIngredients.length; i++) {
      result.push(flatIngredients[flatIdx++]);
    }
  }

  // Append any remaining ingredients that weren't covered by groups
  while (flatIdx < flatIngredients.length) {
    result.push(flatIngredients[flatIdx++]);
  }

  return result;
}

export function scrapeRecipe(html: string, url: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);

  // Strategy 1: JSON-LD structured data (most recipe sites)
  const jsonLdResult = extractFromJsonLd($);
  if (jsonLdResult) {
    if (!jsonLdResult.servings) jsonLdResult.servings = extractServingsFromHtml($);
    if (!jsonLdResult.author) jsonLdResult.author = extractAuthorFromHtml($);
    // JSON-LD gives a flat ingredient list — supplement with group headers from HTML
    const groupHeaders = extractIngredientGroupHeaders($);
    if (groupHeaders) {
      jsonLdResult.ingredients = mergeGroupHeaders(jsonLdResult.ingredients, groupHeaders);
    }
    return jsonLdResult;
  }

  // Strategy 2: Microdata
  const microdataResult = extractFromMicrodata($);
  if (microdataResult) {
    if (!microdataResult.servings) microdataResult.servings = extractServingsFromHtml($);
    if (!microdataResult.author) microdataResult.author = extractAuthorFromHtml($);
    return microdataResult;
  }

  // Strategy 3: Open Graph + heuristic
  const ogResult = extractFromOpenGraph($, url);
  if (ogResult) {
    ogResult.servings = extractServingsFromHtml($);
    ogResult.author = extractAuthorFromHtml($);
    return ogResult;
  }

  return null;
}

function extractFromJsonLd(
  $: cheerio.CheerioAPI
): ScrapedRecipe | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const raw = $(scripts[i]).html();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const recipe = findRecipeInJsonLd(data);
      if (recipe) return recipe;
    } catch {
      continue;
    }
  }
  return null;
}

function findRecipeInJsonLd(data: unknown, graph?: unknown[]): ScrapedRecipe | null {
  if (!data || typeof data !== "object") return null;

  // Handle arrays (some sites wrap in array)
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInJsonLd(item, graph);
      if (result) return result;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check @graph (common in WordPress sites)
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    const graphNodes = obj["@graph"] as unknown[];
    for (const item of graphNodes) {
      const result = findRecipeInJsonLd(item, graphNodes);
      if (result) return result;
    }
  }

  // Check if this object is a Recipe
  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (!isRecipe) return null;

  const title = decodeEntities(String(obj.name ?? "Untitled Recipe"));
  const image = extractImage(obj.image);
  const ingredients = detectAndMarkSectionHeaders(
    extractStringArray(obj.recipeIngredient).map(decodeEntities),
  );
  const instructions = extractInstructions(obj.recipeInstructions).map(decodeEntities);

  if (ingredients.length === 0 && instructions.length === 0) return null;

  // Extract metadata
  const prepTime = extractDuration(obj.prepTime);
  const cookTime = extractDuration(obj.cookTime);
  const totalTime = extractDuration(obj.totalTime);
  const servings = extractServings(obj.recipeYield) ?? extractServings(obj.yield);
  let author = extractAuthor(obj.author);

  // Resolve @id references for author (common in WordPress @graph structures)
  if (!author && graph && obj.author && typeof obj.author === "object") {
    const authorRef = obj.author as Record<string, unknown>;
    const authorId = authorRef["@id"];
    if (typeof authorId === "string") {
      const personNode = graph.find(
        (node) =>
          node &&
          typeof node === "object" &&
          (node as Record<string, unknown>)["@id"] === authorId,
      ) as Record<string, unknown> | undefined;
      if (personNode) {
        author = extractAuthor(personNode);
      }
    }
  }

  const cuisineType = typeof obj.recipeCuisine === "string"
    ? obj.recipeCuisine
    : Array.isArray(obj.recipeCuisine)
      ? (obj.recipeCuisine as unknown[]).filter((c): c is string => typeof c === "string").join(", ")
      : null;

  return {
    title,
    image,
    ingredients,
    instructions,
    prepTime,
    cookTime,
    totalTime,
    servings,
    author,
    cuisineType,
  };
}

function extractDuration(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  return null;
}

/** Extracts servings as a number-only string (e.g. "4 servings" → "4"). */
function extractServings(val: unknown): string | null {
  if (!val) return null;
  let raw: string;
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    raw = val;
  } else if (Array.isArray(val) && val.length > 0) {
    raw = typeof val[0] === "string" ? val[0] : String(val[0]);
  } else {
    return null;
  }
  const match = raw.match(/\d+/);
  return match ? match[0] : null;
}

function extractAuthor(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) {
      const obj = first as Record<string, unknown>;
      if (typeof obj.name === "string") return obj.name;
    }
  }
  return null;
}

function extractImage(img: unknown): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    const first = img[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      return typeof obj.url === "string" ? obj.url : null;
    }
  }
  if (typeof img === "object") {
    const obj = img as Record<string, unknown>;
    return typeof obj.url === "string" ? obj.url : null;
  }
  return null;
}

function extractStringArray(arr: unknown): string[] {
  if (!arr) return [];
  if (Array.isArray(arr)) {
    return arr
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const text = obj.text ?? obj.name ?? "";
          return typeof text === "string" ? text.trim() : String(text).trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof arr === "string") return [arr.trim()];
  return [];
}

function extractInstructions(instructions: unknown): string[] {
  if (!instructions) return [];
  if (typeof instructions === "string") {
    return instructions
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(instructions)) {
    const result: string[] = [];
    for (const item of instructions) {
      if (typeof item === "string") {
        result.push(item.trim());
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        // HowToSection with itemListElement
        if (obj["@type"] === "HowToSection" && Array.isArray(obj.itemListElement)) {
          for (const step of obj.itemListElement) {
            if (typeof step === "string") {
              result.push(step.trim());
            } else if (step && typeof step === "object") {
              const stepObj = step as Record<string, unknown>;
              const text = stepObj.text ?? stepObj.name ?? "";
              const str = typeof text === "string" ? text.trim() : String(text).trim();
              if (str) result.push(str);
            }
          }
        } else {
          // HowToStep
          const text = obj.text ?? obj.name ?? "";
          const str = typeof text === "string" ? text.trim() : String(text).trim();
          if (str) result.push(str);
        }
      }
    }

    // Post-process: some sites (e.g. halfbakedharvest.com) concatenate all steps
    // into a single HowToStep with embedded numbering like "1. Do X.2. Do Y."
    // Split those back into individual steps.
    const expanded: string[] = [];
    for (const step of result) {
      const split = splitNumberedSteps(step);
      if (split) {
        expanded.push(...split);
      } else {
        expanded.push(step);
      }
    }
    return expanded.filter(Boolean);
  }
  return [];
}

/**
 * Detects and splits a single text block that contains embedded numbered steps.
 * E.g. "1. Preheat oven.2. Mix ingredients.3. Bake for 30 min."
 * Returns null if the text doesn't contain sequential numbered steps.
 */
function splitNumberedSteps(text: string): string[] | null {
  if (!/^\s*1\.\s/.test(text)) return null;

  const steps: string[] = [];
  let remaining = text.trim();
  let stepNum = 1;

  while (remaining.length > 0) {
    const prefix = new RegExp(`^${stepNum}\\.\\s+`);
    if (!prefix.test(remaining)) break;

    remaining = remaining.replace(prefix, "");
    const nextNum = stepNum + 1;

    // Find where the next sequential step starts: "N+1." after sentence punctuation
    const nextStepRegex = new RegExp(`([.!?])\\s*${nextNum}\\.\\s`);
    const match = remaining.match(nextStepRegex);

    if (match && match.index !== undefined) {
      // Include the sentence-ending punctuation in the current step
      const endIndex = match.index + match[1].length;
      steps.push(remaining.substring(0, endIndex).trim());
      remaining = remaining.substring(endIndex).trim();
    } else {
      // Last step — take the rest
      steps.push(remaining.trim());
      remaining = "";
    }

    stepNum = nextNum;
  }

  return steps.length > 1 ? steps : null;
}

/**
 * Extracts ingredients with section headers from HTML structure.
 * Checks for common recipe plugin patterns (WPRM, Tasty, etc.) that wrap
 * ingredient groups in containers with a header element, then falls back
 * to flat itemprop selection with `detectAndMarkSectionHeaders`.
 */
function extractIngredientsFromHtml(
  $: cheerio.CheerioAPI,
  recipeEl: ReturnType<cheerio.CheerioAPI>,
): string[] {
  // Strategy A: Look for ingredient group containers with named headers
  const groupSelectors = [
    { container: ".wprm-recipe-ingredient-group", header: ".wprm-recipe-group-name" },
    { container: ".tasty-recipe-ingredient-group", header: ".tasty-recipe-ingredient-group-title" },
    { container: ".ingredient-group", header: ".ingredient-group-title, .ingredient-group-name, h3, h4" },
    { container: '[class*="ingredient-group"]', header: '[class*="group-name"], [class*="group-title"], h3, h4' },
  ];

  for (const { container, header } of groupSelectors) {
    const groups = recipeEl.find(container);
    if (groups.length === 0) continue;

    const result: string[] = [];
    groups.each((_, groupEl) => {
      const headerEl = $(groupEl).find(header).first();
      const headerText = headerEl.text().trim();
      if (headerText) {
        result.push(`## ${headerText}${headerText.endsWith(":") ? "" : ":"}`);
      }
      // Get ingredient items within this group
      $(groupEl)
        .find('[itemprop="recipeIngredient"], [itemprop="ingredients"], li')
        .each((__, ingEl) => {
          const text = decodeEntities($(ingEl).text().trim());
          if (text && text !== headerText) result.push(text);
        });
    });

    if (result.length > 0) return result;
  }

  // Strategy B: Flat itemprop selection with header auto-detection
  return detectAndMarkSectionHeaders(
    recipeEl
      .find('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
      .map((_, el) => decodeEntities($(el).text().trim()))
      .get()
      .filter(Boolean),
  );
}

function extractFromMicrodata(
  $: cheerio.CheerioAPI
): ScrapedRecipe | null {
  const recipeEl = $('[itemtype*="schema.org/Recipe"], [itemtype*="Recipe"]').first();
  if (recipeEl.length === 0) return null;

  const title = decodeEntities(
    recipeEl.find('[itemprop="name"]').first().text().trim() || "Untitled Recipe"
  );
  const image =
    recipeEl.find('[itemprop="image"]').first().attr("src") ||
    recipeEl.find('[itemprop="image"]').first().attr("content") ||
    null;
  const ingredients = extractIngredientsFromHtml($, recipeEl);
  const instructions = recipeEl
    .find('[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"] li')
    .map((_, el) => decodeEntities($(el).text().trim()))
    .get()
    .filter(Boolean);

  if (ingredients.length === 0 && instructions.length === 0) return null;

  // Extract metadata from microdata
  const prepTime = recipeEl.find('[itemprop="prepTime"]').attr("content") ||
    recipeEl.find('[itemprop="prepTime"]').attr("datetime") || null;
  const cookTime = recipeEl.find('[itemprop="cookTime"]').attr("content") ||
    recipeEl.find('[itemprop="cookTime"]').attr("datetime") || null;
  const totalTime = recipeEl.find('[itemprop="totalTime"]').attr("content") ||
    recipeEl.find('[itemprop="totalTime"]').attr("datetime") || null;
  const rawServings =
    recipeEl.find('[itemprop="recipeYield"]').attr("content") ||
    recipeEl.find('[itemprop="recipeYield"]').text().trim() ||
    recipeEl.find('[itemprop="yield"]').attr("content") ||
    recipeEl.find('[itemprop="yield"]').text().trim() ||
    null;
  const servings = extractServings(rawServings);
  const authorEl = recipeEl.find('[itemprop="author"]').first();
  const author =
    authorEl.attr("content")?.trim() ||
    authorEl.find('[itemprop="name"]').first().text().trim() ||
    authorEl.text().trim() ||
    null;

  const cuisineType = recipeEl.find('[itemprop="recipeCuisine"]').attr("content") ||
    recipeEl.find('[itemprop="recipeCuisine"]').text().trim() || null;

  return { title, image, ingredients, instructions, prepTime, cookTime, totalTime, servings, author, cuisineType };
}

// ---------------------------------------------------------------------------
// HTML-based servings fallback — scans visible text and common CSS patterns
// ---------------------------------------------------------------------------

function extractServingsFromHtml($: cheerio.CheerioAPI): string | null {
  // 1. Check common CSS class / data-attribute selectors
  const classSelectors = [
    '[class*="servings"]',
    '[class*="serving-"]',
    '[class*="yield"]',
    '[class*="recipe-yield"]',
    '[data-servings]',
    '.recipe-servings',
    '.recipe-yield',
    '.tasty-recipes-yield',
    '.wprm-recipe-servings',
    '.wprm-recipe-yield',
  ];

  for (const selector of classSelectors) {
    const el = $(selector).first();
    if (el.length) {
      // Check data-servings attribute first
      const dataVal = el.attr("data-servings") || el.attr("data-original-servings");
      if (dataVal) {
        const dataNum = dataVal.match(/\d+/);
        if (dataNum) return dataNum[0];
      }

      const text = el.text().trim();
      const num = text.match(/\d+/);
      if (num) return num[0];
    }
  }

  // 2. Look for label:value patterns in the page text
  //    Matches: "Yield: 6", "Servings: 4", "Serves: 8", "Makes: 12", "Portions: 6"
  const labelPatterns = [
    /(?:yield|servings?|serves|makes|portions?)\s*[:]\s*(\d+)/i,
    /(?:yield|servings?|serves|makes|portions?)\s+(\d+)/i,
  ];

  // Scan elements likely to contain recipe metadata
  const candidates = $('span, p, div, li, td, dt, dd, label').toArray();
  for (const el of candidates) {
    const text = $(el).text().trim();
    // Skip very long text blocks (probably not a metadata label)
    if (text.length > 100) continue;
    for (const pattern of labelPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
  }

  return null;
}

function extractFromOpenGraph(
  $: cheerio.CheerioAPI,
  _url: string
): ScrapedRecipe | null {
  const title = decodeEntities(
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim()
  );
  const image =
    $('meta[property="og:image"]').attr("content") || null;

  if (!title) return null;

  // Try to find ingredient/instruction lists heuristically
  const ingredients: string[] = [];
  const instructions: string[] = [];
  const seenIngredients = new Set<string>();
  const seenInstructions = new Set<string>();

  // Look for lists that might contain ingredients (prefer specific selectors first)
  $(".ingredient, .ingredients li, [class*='ingredient'] li, ul li").each(
    (_, el) => {
      const text = decodeEntities($(el).text().trim());
      const key = text.toLowerCase();
      if (text && text.length < 150 && !seenIngredients.has(key)) {
        // Skip items that look like instructions
        if (/^(add|mix|combine|stir|heat|serve|fold|pour|preheat|bake|cook)\b/i.test(text)) return;
        seenIngredients.add(key);
        ingredients.push(text);
      }
    }
  );

  // Look for ordered lists or instruction-like elements
  $(
    "ol li, .instruction, .instructions li, .step, .steps li, [class*='instruction'] li, [class*='direction'] li, [class*='step'] li"
  ).each((_, el) => {
    const text = decodeEntities($(el).text().trim());
    const key = text.toLowerCase();
    if (text && text.length < 1000 && !seenInstructions.has(key)) {
      seenInstructions.add(key);
      instructions.push(text);
    }
  });

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return { title, image, ingredients: detectAndMarkSectionHeaders(ingredients), instructions };
}

// ---------------------------------------------------------------------------
// HTML-based author fallback — checks meta tags, common CSS selectors, and
// itemprop attributes to find the recipe author when structured data fails.
// ---------------------------------------------------------------------------

function extractAuthorFromHtml($: cheerio.CheerioAPI): string | null {
  // 1. Meta tags (article:author, og:article:author, author)
  const metaAuthor =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    $('meta[property="og:article:author"]').attr("content");
  if (metaAuthor?.trim()) return metaAuthor.trim();

  // 2. itemprop="author" (content attr or text)
  const itempropEl = $('[itemprop="author"]').first();
  if (itempropEl.length) {
    const content = itempropEl.attr("content");
    if (content?.trim()) return content.trim();
    // Might contain a nested itemprop="name"
    const nameEl = itempropEl.find('[itemprop="name"]');
    if (nameEl.length) {
      const name = nameEl.text().trim();
      if (name) return name;
    }
    const text = itempropEl.text().trim();
    if (text && text.length < 100) return text;
  }

  // 3. Common CSS class selectors used by recipe sites
  const selectors = [
    ".recipe-author",
    ".author-name",
    ".entry-author-name",
    '[class*="author"] [class*="name"]',
    '[class*="byline"] a',
    ".byline",
    '[rel="author"]',
  ];
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().trim();
      if (text && text.length < 100) return text;
    }
  }

  return null;
}
