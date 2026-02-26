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

  // Strategy 4: DOM text walk (for SPA sites with no structured data or semantic HTML)
  const domResult = extractFromDomText($);
  if (domResult) {
    domResult.servings = extractServingsFromHtml($);
    domResult.author = extractAuthorFromHtml($);
    return domResult;
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
  //    Also matches number-before-keyword: "4 servings", "6 portions"
  const labelPatterns = [
    /(?:yield|servings?|serves|makes|portions?)\s*[:]\s*(\d+)/i,
    /(?:yield|servings?|serves|makes|portions?)\s+(\d+)/i,
    /(\d+)\s+servings?\b/i,
    /(\d+)\s+portions?\b/i,
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

/**
 * Exclusion selector for structural / non-content elements.
 * Used by the OG fallback to avoid picking up nav links, footer items, etc.
 */
const NON_CONTENT_ANCESTORS = [
  "nav", "footer", "header", "aside",
  '[role="navigation"]',
  '[class*="nav"]', '[class*="menu"]', '[class*="sidebar"]',
  '[class*="footer"]', '[class*="header"]', '[class*="widget"]',
  '[class*="comment"]', '[class*="share"]', '[class*="social"]',
  '[class*="related"]', '[class*="popular"]', '[class*="trending"]',
].join(", ");

/**
 * Finds ingredient lists by looking for headings containing "ingredient"
 * and extracting list items from the sibling lists that follow.
 * Stops at the next heading of the same or higher level (e.g. "Instructions").
 */
function extractIngredientsNearHeadings($: cheerio.CheerioAPI): string[] {
  const results: string[] = [];

  $("h1, h2, h3, h4, h5, h6").each((_, headingEl) => {
    if (results.length > 0) return; // already found via a previous heading

    const headingText = $(headingEl).text().trim();
    if (!/ingredient/i.test(headingText)) return;

    const headingLevel = parseInt(headingEl.tagName?.replace(/h/i, "") || "6");
    let current = $(headingEl).next();

    while (current.length) {
      const tag = (current.prop("tagName") || "").toLowerCase();

      // Stop at the next heading of same or higher level
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag.replace("h", ""));
        if (level <= headingLevel) break;
      }

      // Extract items from lists
      if (tag === "ul" || tag === "ol") {
        current.find("li").each((__, li) => {
          const text = decodeEntities($(li).text().trim());
          if (text && text.length < 200) results.push(text);
        });
      }

      current = current.next();
    }
  });

  return results;
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

  /** Helper to add an ingredient if it passes basic filters. */
  const addIngredient = (text: string): void => {
    const key = text.toLowerCase();
    if (!text || text.length >= 150 || seenIngredients.has(key)) return;
    if (/^(add|mix|combine|stir|heat|serve|fold|pour|preheat|bake|cook)\b/i.test(text)) return;
    seenIngredients.add(key);
    ingredients.push(text);
  };

  // --- Tier 1: Elements with explicit ingredient class names ---
  $(".ingredient, .ingredients li, [class*='ingredient'] li").each((_, el) => {
    addIngredient(decodeEntities($(el).text().trim()));
  });

  // --- Tier 2: Lists that follow an "Ingredients" heading ---
  if (ingredients.length === 0) {
    for (const text of extractIngredientsNearHeadings($)) {
      addIngredient(text);
    }
  }

  // --- Tier 3: Broad ul li, scoped to main content area ---
  // Only used as last resort; excludes nav, footer, sidebar, etc.
  if (ingredients.length === 0) {
    const contentArea = $(
      "article, [class*='entry-content'], [class*='post-content'], main, [role='main']",
    ).first();
    const scope = contentArea.length ? contentArea : $("body");

    scope.find("ul li").each((_, el) => {
      const $el = $(el);
      if ($el.closest(NON_CONTENT_ANCESTORS).length) return;
      addIngredient(decodeEntities($el.text().trim()));
    });
  }

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

// ---------------------------------------------------------------------------
// Strategy 4: DOM text walk — extracts recipes from arbitrary DOM structures
// by finding section headings ("Ingredients", "Instructions") and collecting
// text content regardless of tag type. Designed for SPA sites (e.g. MUI)
// that render everything as generic divs with no structured data.
// ---------------------------------------------------------------------------

/** Regex patterns for identifying ingredient/instruction section headings. */
const INGREDIENTS_HEADING_RE = /^ingredients?\s*:?\s*$/i;
const INSTRUCTIONS_HEADING_RE =
  /^(instructions?|directions?|steps?|method|preparation)\s*:?\s*$/i;

/**
 * Stop headings — when collecting text after "Instructions", stop at these.
 * Prevents nutrition data, notes, etc. from being included as instruction text.
 */
const STOP_SECTION_RE =
  /^(nutrition|nutritional\s+info|nutritional?\s+facts|notes?|tips?|storage|equipment|video|comments?|ratings?|reviews?|related|you\s+may\s+also|more\s+recipes)\s*:?\s*$/i;

/** Tags to skip entirely when collecting text content. */
const SKIP_TAGS = new Set([
  "script", "style", "button", "input", "select", "textarea", "svg", "noscript",
]);

/** Block-level tags — used to decide if an element is a "leaf" or container. */
const BLOCK_TAGS = new Set([
  "div", "p", "section", "article", "main", "aside", "header", "footer",
  "nav", "ul", "ol", "li", "table", "tr", "td", "th", "blockquote",
  "figure", "figcaption", "details", "summary", "form", "fieldset",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "pre", "address", "dl", "dt", "dd",
]);

/** UI noise words that should never appear as ingredient or instruction text. */
const UI_NOISE_RE =
  /^(home|back|menu|login|sign ?in|sign ?up|register|share|print|save|bookmark|subscribe|follow|search|cart|checkout|skip|close|cancel|delete|remove|edit|more|less|show|hide|toggle|expand|collapse|previous|next|submit|reset|ok|yes|no|continue|loading|advertisement|sponsored|ad)\b/i;

/** Cooking verb prefixes — used to filter action phrases from ingredient lists. */
const COOKING_VERB_RE =
  /^(add|mix|combine|stir|heat|serve|fold|pour|preheat|bake|cook|whisk|blend|sauté|saute|chop|dice|slice|mince|grate|drain|rinse|boil|simmer|fry|roast|grill|broil|steam|marinate|season|garnish|top|drizzle|spread|brush|toss|knead|roll|shape|chill|freeze|refrigerate|let|allow|set|place|put|transfer|remove|take|bring|turn|reduce|increase|adjust|taste|check)\b/i;

/**
 * Extracts the direct text content of an element (text nodes only),
 * ignoring text from child elements. Falls back to full text for
 * leaf-like elements (no block-level children).
 */
function getDirectText(
  $: cheerio.CheerioAPI,
  el: cheerio.Element,
): string {
  let directText = "";
  for (const child of el.children) {
    if (child.type === "text") {
      directText += (child as unknown as { data: string }).data;
    }
  }
  directText = directText.trim();

  // Fallback: if no direct text and element is leaf-like (no block children), use full text
  if (!directText) {
    const hasBlockChild = el.children.some(
      (c) => c.type === "tag" && BLOCK_TAGS.has((c as cheerio.Element).tagName?.toLowerCase()),
    );
    if (!hasBlockChild) {
      directText = $(el).text().trim();
    }
  }

  return directText;
}

/**
 * Recursively collects "leaf" text from a subtree. Recurses into elements
 * with block-level children; collects text from leaf elements directly.
 * Skips non-content tags and elements inside non-content ancestors.
 */
function collectLeafTexts(
  $: cheerio.CheerioAPI,
  el: cheerio.Element,
): string[] {
  const tag = el.tagName?.toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return [];
  if ($(el).closest(NON_CONTENT_ANCESTORS).length) return [];

  // Check if this element has block-level children
  const hasBlockChild = el.children.some(
    (c) => c.type === "tag" && BLOCK_TAGS.has((c as cheerio.Element).tagName?.toLowerCase()),
  );

  if (hasBlockChild) {
    // Recurse into children
    const results: string[] = [];
    for (const child of el.children) {
      if (child.type === "tag") {
        results.push(...collectLeafTexts($, child as cheerio.Element));
      }
    }
    return results;
  }

  // Leaf element — collect its text
  const text = $(el).text().trim();
  if (text) return [text];
  return [];
}

/**
 * Checks whether an element is a heading-level tag (h1-h6) or has a
 * MUI heading class (MuiTypography-h1 through MuiTypography-h6).
 */
function isHeadingTag(el: cheerio.Element): boolean {
  if (/^h[1-6]$/i.test(el.tagName || "")) return true;
  const cls = (el.attribs?.class || "");
  return /MuiTypography-h[1-6]/.test(cls);
}

/**
 * Checks if an element's text matches a section heading pattern.
 * Only matches short text (<50 chars) to avoid false positives on content.
 */
function matchesSectionHeading(
  $: cheerio.CheerioAPI,
  el: cheerio.Element,
  pattern: RegExp,
): boolean {
  const text = getDirectText($, el);
  return text.length > 0 && text.length < 50 && pattern.test(text);
}

/**
 * Walks siblings after a heading element and collects leaf text.
 * Stops at the next section heading or h1-h6 element.
 * If sibling walk yields nothing, falls back to walking the parent's
 * children after the heading.
 */
function collectTextAfterHeading(
  $: cheerio.CheerioAPI,
  headingEl: cheerio.Element,
): string[] {
  const results: string[] = [];

  /** Returns true if this element's text matches a known section boundary. */
  const isSectionBoundary = (el: cheerio.Element): boolean => {
    if (isHeadingTag(el)) return true;
    const text = getDirectText($, el);
    if (text.length === 0 || text.length >= 50) return false;
    return (
      INGREDIENTS_HEADING_RE.test(text) ||
      INSTRUCTIONS_HEADING_RE.test(text) ||
      STOP_SECTION_RE.test(text)
    );
  };

  // Strategy A: walk siblings
  let current = $(headingEl).next();
  while (current.length) {
    const rawEl = current[0];
    if (!rawEl || rawEl.type !== "tag") break;
    const el = rawEl as cheerio.Element;

    if (isSectionBoundary(el)) break;

    results.push(...collectLeafTexts($, el));
    current = current.next();
  }

  if (results.length > 0) return results;

  // Strategy B: heading and content share a parent — walk parent's children after heading
  const parent = headingEl.parent;
  if (!parent || parent.type !== "tag") return [];

  let pastHeading = false;
  for (const child of parent.children) {
    if (child === headingEl) {
      pastHeading = true;
      continue;
    }
    if (!pastHeading) continue;
    if (child.type !== "tag") continue;

    const childEl = child as cheerio.Element;
    if (isSectionBoundary(childEl)) break;

    results.push(...collectLeafTexts($, childEl));
  }

  return results;
}

/**
 * Extracts text from an element by joining each child node's text with spaces.
 * Handles the pattern where `<span>2 lbs</span>boneless chicken` would otherwise
 * produce "2 lbsboneless chicken" — this returns "2 lbs boneless chicken".
 */
function extractTextWithSpaces(
  $: cheerio.CheerioAPI,
  el: cheerio.Element,
): string {
  const parts: string[] = [];
  for (const child of el.children) {
    let text = "";
    if (child.type === "text") {
      text = (child as unknown as { data: string }).data.trim();
    } else if (child.type === "tag") {
      text = $(child).text().trim();
    }
    if (text) parts.push(text);
  }
  return parts.join(" ");
}

/**
 * Detects ingredient lines that list multiple items with a shared quantity
 * (e.g. "2 tsps paprika, chili powder, cumin" or "1 tsp garlic powder, cumin"
 * with note "1 tsp each") and expands them into individual ingredient lines.
 *
 * Triggers when:
 *   - The note text contains the word "each" (any item count >= 2), OR
 *   - The main text has 3+ short comma/&-separated items after qty+unit
 *     (strong heuristic: "2 tsp X, Y, Z" is always "2 tsp of each")
 *
 * Returns an array of expanded ingredient strings, or null if no expansion needed.
 */
function expandEachIngredient(
  mainText: string,
  noteText: string,
): string[] | null {
  const noteHasEach = /\beach\b/i.test(noteText);

  // Parse: "<qty> <unit> <item1>, <item2>, ..."
  const match = mainText.match(
    /^(\d+(?:\.\d+)?(?:\/\d+)?)\s+(tsps?|tsp|Tbs|tbsps?|tbsp|tablespoons?|teaspoons?|cups?|oz|ounces?|lbs?|pounds?|grams?|g|kg|ml|l|pinch(?:es)?|dash(?:es)?)\s+(.+)$/i,
  );
  if (!match) return null;

  const qty = match[1];
  const unit = match[2];
  const rest = match[3];

  // Split on comma, " & ", " and "
  const items = rest
    .split(/\s*(?:,\s*|\s+&\s+|\s+and\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Need explicit "each" signal or 3+ short items for auto-expansion
  if (items.length < 2) return null;
  if (!noteHasEach && items.length < 3) return null;
  // All items should be short (individual ingredients, not long descriptions)
  if (items.some((item) => item.length > 40)) return null;

  return items.map((item) => `${qty} ${unit} ${item}`);
}

/**
 * Extracts ingredients from checkbox-based ingredient lists (e.g. ostarecipes.com).
 * Each ingredient row has `<input type="checkbox">` + a sibling text container.
 * Also detects group headers by looking for heading-like elements preceding groups.
 *
 * Returns an array of ingredient strings (with "## Header:" for group headers),
 * or null if no checkbox-based ingredients are found.
 */
function extractIngredientsFromCheckboxes(
  $: cheerio.CheerioAPI,
): string[] | null {
  const checkboxes = $('input[type="checkbox"]');
  if (checkboxes.length < 2) return null;

  const ingredients: string[] = [];
  /** Tracks which group header elements we've already emitted. */
  const emittedHeaders = new Set<cheerio.Element>();

  checkboxes.each((_, cb) => {
    // Walk up to the ingredient row container (the div holding checkbox + text)
    const row = $(cb).closest("div[class], div").not("label").first();
    if (!row.length) return;

    // Detect group header: look for a preceding heading-like element.
    // Walk backward through previous siblings of the row to find a heading
    // (MuiTypography-h3/h4 or a short standalone text element before an <hr>).
    let prev = row.prev();
    while (prev.length) {
      const tag = (prev.prop("tagName") || "").toLowerCase();
      // Skip <hr> dividers
      if (tag === "hr") {
        prev = prev.prev();
        continue;
      }
      // Check if this is a heading element (MUI h3/h4 or native h1-h6)
      const rawEl = prev[0] as cheerio.Element;
      if (rawEl && isHeadingTag(rawEl)) {
        const headerText = prev.text().trim();
        if (headerText && headerText.length < 80 && !emittedHeaders.has(rawEl)) {
          emittedHeaders.add(rawEl);
          const formatted = headerText.endsWith(":") ? headerText : `${headerText}:`;
          ingredients.push(`## ${formatted}`);
        }
      }
      break;
    }

    // Extract ingredient text from the text container next to the label.
    // Structure: row > label (checkbox) + div (text container)
    //   text container has <p> with <span>qty</span>name, and optional note <p>
    const label = $(cb).closest("label");
    const textContainer = label.next("div").first();
    if (!textContainer.length) return;

    // Get all <p> elements in the text container
    const paragraphs = textContainer.find("p");
    if (paragraphs.length === 0) return;

    // First <p> is the main ingredient line — use space-aware extraction
    const mainP = paragraphs.first()[0] as cheerio.Element;
    const mainText = extractTextWithSpaces($, mainP).trim();
    if (!mainText) return;

    // Additional <p> elements may be notes (e.g. "sliced", "1 tsp each") — skip if hidden
    const notes: string[] = [];
    paragraphs.slice(1).each((__, noteEl) => {
      const $note = $(noteEl);
      if ($note.attr("hidden") !== undefined) return; // skip hidden notes
      const note = $note.text().trim();
      if (note) notes.push(note);
    });

    const rawNoteText = notes.join(", ");

    // Check for "each" expansion: "2 tsps paprika, cumin, cayenne" → separate lines
    const expanded = expandEachIngredient(mainText, rawNoteText);
    if (expanded) {
      ingredients.push(...expanded);
      return;
    }

    // Single ingredient with notes appended
    const noteText = rawNoteText ? `, ${rawNoteText}` : "";
    ingredients.push(mainText + noteText);
  });

  return ingredients.length >= 2 ? ingredients : null;
}

/**
 * Finds a recipe-relevant image from the DOM when og:image is missing or generic.
 * Looks for large content images (Firebase, Cloudinary, imgix, etc.), skipping
 * logos, icons, SVGs, and tiny images.
 */
function extractRecipeImage($: cheerio.CheerioAPI): string | null {
  // Common recipe image hosting patterns
  const RECIPE_IMAGE_HOSTS = /firebasestorage\.googleapis\.com|cloudinary\.com|imgix\.net|cloudfront\.net/;

  // First, try images from known recipe image hosts
  const imgs = $("img[src]").toArray();
  for (const img of imgs) {
    const src = $(img).attr("src") || "";
    if (RECIPE_IMAGE_HOSTS.test(src)) {
      // Skip avatars and tiny images
      const width = parseInt($(img).attr("width") || "0");
      const height = parseInt($(img).attr("height") || "0");
      if ((width > 0 && width < 50) || (height > 0 && height < 50)) continue;
      if (/avatar|logo|icon|profile/i.test(src)) continue;
      // Prefer larger images — recipe images often have "recipe" or "media" in URL
      if (/recipe|media|upload|image/i.test(src)) return src;
    }
  }

  // Second pass: any image from a recipe image host (that isn't tiny/avatar)
  for (const img of imgs) {
    const src = $(img).attr("src") || "";
    if (RECIPE_IMAGE_HOSTS.test(src)) {
      if (/avatar|logo|icon|profile/i.test(src)) continue;
      return src;
    }
  }

  return null;
}

/**
 * Parses plain-text time strings like "20 min", "1 hr", "60 minutes", "1 hour 30 min"
 * into ISO 8601 duration format (e.g. "PT20M", "PT1H", "PT1H30M").
 * Returns null if the text doesn't contain a recognizable time pattern.
 */
function parseTimeToISO(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  let hours = 0;
  let minutes = 0;

  // Match "1 hr 30 min", "1 hour 30 minutes", "1h30m" patterns
  const combined = normalized.match(/(\d+)\s*(?:hr|hour|h)\w*\s*(?:(\d+)\s*(?:min|m)\w*)?/);
  if (combined) {
    hours = parseInt(combined[1]);
    minutes = combined[2] ? parseInt(combined[2]) : 0;
  } else {
    // Match standalone minutes: "20 min", "60 minutes"
    const minMatch = normalized.match(/(\d+)\s*(?:min|m)\w*/);
    if (minMatch) {
      minutes = parseInt(minMatch[1]);
    } else {
      // Match standalone hours: "1 hr", "2 hours"
      const hrMatch = normalized.match(/(\d+)\s*(?:hr|hour|h)\w*/);
      if (hrMatch) {
        hours = parseInt(hrMatch[1]);
      } else {
        return null;
      }
    }
  }

  if (hours === 0 && minutes === 0) return null;
  let iso = "PT";
  if (hours > 0) iso += `${hours}H`;
  if (minutes > 0) iso += `${minutes}M`;
  return iso;
}

/**
 * Strategy 4: Extracts recipe data from arbitrary DOM structures by scanning
 * for section headings ("Ingredients", "Instructions") and collecting text
 * from subsequent elements. Works with SPA sites that use generic divs
 * (e.g. MUI) instead of semantic HTML or structured data.
 *
 * Returns null if fewer than 2 ingredients AND fewer than 2 instructions found.
 */
function extractFromDomText($: cheerio.CheerioAPI): ScrapedRecipe | null {
  let ingredientHeading: cheerio.Element | null = null;
  let instructionHeading: cheerio.Element | null = null;

  // Scan all elements for section headings
  $("*").each((_, el) => {
    if (ingredientHeading && instructionHeading) return;
    if (el.type !== "tag") return;

    if (!ingredientHeading && matchesSectionHeading($, el, INGREDIENTS_HEADING_RE)) {
      ingredientHeading = el;
    } else if (!instructionHeading && matchesSectionHeading($, el, INSTRUCTIONS_HEADING_RE)) {
      instructionHeading = el;
    }
  });

  // --- Ingredients: heading-based or checkbox-based ---
  let ingredients: string[] = [];

  if (ingredientHeading) {
    // Heading-based: collect text after the "Ingredients" heading
    const rawIngredients = collectTextAfterHeading($, ingredientHeading);
    const seenIngredients = new Set<string>();
    for (const raw of rawIngredients) {
      for (const line of raw.split("\n")) {
        const text = decodeEntities(line.trim());
        if (!text || text.length < 3 || text.length > 150) continue;
        if (COOKING_VERB_RE.test(text)) continue;
        if (UI_NOISE_RE.test(text)) continue;
        const key = text.toLowerCase();
        if (seenIngredients.has(key)) continue;
        seenIngredients.add(key);
        ingredients.push(text);
      }
    }
  }

  // If heading-based extraction found nothing, try checkbox-based
  if (ingredients.length === 0) {
    const checkboxIngredients = extractIngredientsFromCheckboxes($);
    if (checkboxIngredients) {
      ingredients = checkboxIngredients;
    }
  }

  // --- Instructions: heading-based ---
  const rawInstructions = instructionHeading ? collectTextAfterHeading($, instructionHeading) : [];
  const seenInstructions = new Set<string>();
  const instructions: string[] = [];
  for (const raw of rawInstructions) {
    for (const line of raw.split("\n")) {
      let text = decodeEntities(line.trim());
      if (!text || text.length < 10 || text.length > 1000) continue;
      if (UI_NOISE_RE.test(text)) continue;

      // Try splitting concatenated numbered steps first (needs "1." intact)
      const split = splitNumberedSteps(text);
      if (split) {
        for (const step of split) {
          const stepKey = step.toLowerCase();
          if (!seenInstructions.has(stepKey)) {
            seenInstructions.add(stepKey);
            instructions.push(step);
          }
        }
        continue;
      }

      // Strip leading step prefixes like "1.", "Step 1:", "Step 1."
      text = text.replace(/^(?:step\s+)?\d+[.:]\s*/i, "");
      if (!text || text.length < 10) continue;

      const key = text.toLowerCase();
      if (seenInstructions.has(key)) continue;
      seenInstructions.add(key);
      instructions.push(text);
    }
  }

  // Need at least ingredients or instructions to proceed
  // (checkbox-based extraction is a strong enough signal on its own)
  if (!ingredientHeading && !instructionHeading && ingredients.length === 0) return null;

  // Minimum threshold: at least 2 ingredients or 2 instructions
  if (ingredients.length < 2 && instructions.length < 2) return null;

  // --- Title: enhanced chain ---
  // 1. Native <h1>
  // 2. MUI Typography-h1 (for SPA sites that render titles as <p class="MuiTypography-h1">)
  // 3. og:title (skip if it looks like a site-wide name with " – " separator)
  // 4. <title>
  let title = $("h1").first().text().trim();

  if (!title) {
    title = $('[class*="MuiTypography-h1"]').first().text().trim();
  }

  if (!title) {
    const ogTitle = $('meta[property="og:title"]').attr("content") || "";
    // Skip og:title that looks like a site-wide name (e.g. "Site – Tagline")
    if (ogTitle && !/ [–—-] /.test(ogTitle)) {
      title = ogTitle;
    }
  }

  if (!title) {
    title = $("title").text().trim();
  }

  title = decodeEntities(title || "Untitled Recipe");

  // --- Image: og:image or DOM extraction ---
  let image = $('meta[property="og:image"]').attr("content") || null;
  // If og:image is missing or looks generic (same domain root, preview image),
  // try finding a recipe image in the DOM
  if (!image || /\/assets\/preview|\/default-|\/og-image/i.test(image)) {
    image = extractRecipeImage($) || image;
  }

  // --- Metadata: prep/cook time from plain text ---
  let prepTime: string | null = null;
  let cookTime: string | null = null;
  const timePattern = /(?:Prep|Cook)\s*:\s*(\d+\s*(?:min|hr|hour|minutes?|hours?)(?:\s*\d+\s*(?:min|minutes?))?)/i;
  $("p, span, div").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 100) return;
    if (!prepTime) {
      const prepMatch = text.match(/Prep\s*:\s*(\d+\s*(?:min|hr|hour|minutes?|hours?)(?:\s*\d+\s*(?:min|minutes?))?)/i);
      if (prepMatch) prepTime = parseTimeToISO(prepMatch[1]);
    }
    if (!cookTime) {
      const cookMatch = text.match(/Cook\s*:\s*(\d+\s*(?:min|hr|hour|minutes?|hours?)(?:\s*\d+\s*(?:min|minutes?))?)/i);
      if (cookMatch) cookTime = parseTimeToISO(cookMatch[1]);
    }
  });

  return {
    title,
    image,
    ingredients: detectAndMarkSectionHeaders(ingredients),
    instructions,
    prepTime,
    cookTime,
  };
}
