import * as cheerio from "cheerio";
import type { ScrapedRecipe } from "@/types";

export function scrapeRecipe(html: string, url: string): ScrapedRecipe | null {
  const $ = cheerio.load(html);

  // Strategy 1: JSON-LD structured data (most recipe sites)
  const jsonLdResult = extractFromJsonLd($);
  if (jsonLdResult) return jsonLdResult;

  // Strategy 2: Microdata
  const microdataResult = extractFromMicrodata($);
  if (microdataResult) return microdataResult;

  // Strategy 3: Open Graph + heuristic
  const ogResult = extractFromOpenGraph($, url);
  if (ogResult) return ogResult;

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

function findRecipeInJsonLd(data: unknown): ScrapedRecipe | null {
  if (!data || typeof data !== "object") return null;

  // Handle arrays (some sites wrap in array)
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInJsonLd(item);
      if (result) return result;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check @graph (common in WordPress sites)
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const result = findRecipeInJsonLd(item);
      if (result) return result;
    }
  }

  // Check if this object is a Recipe
  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (!isRecipe) return null;

  const title = String(obj.name || "Untitled Recipe");
  const image = extractImage(obj.image);
  const ingredients = extractStringArray(obj.recipeIngredient);
  const instructions = extractInstructions(obj.recipeInstructions);

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return { title, image, ingredients, instructions };
}

function extractImage(img: unknown): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    const first = img[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      return (first as Record<string, unknown>).url as string || null;
    }
  }
  if (typeof img === "object") {
    return (img as Record<string, unknown>).url as string || null;
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
          return String(obj.text || obj.name || "").trim();
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
              result.push(String((step as Record<string, unknown>).text || "").trim());
            }
          }
        } else {
          // HowToStep
          const text = String(obj.text || obj.name || "").trim();
          if (text) result.push(text);
        }
      }
    }
    return result.filter(Boolean);
  }
  return [];
}

function extractFromMicrodata(
  $: cheerio.CheerioAPI
): ScrapedRecipe | null {
  const recipeEl = $('[itemtype*="schema.org/Recipe"]');
  if (recipeEl.length === 0) return null;

  const title =
    recipeEl.find('[itemprop="name"]').first().text().trim() || "Untitled Recipe";
  const image =
    recipeEl.find('[itemprop="image"]').first().attr("src") ||
    recipeEl.find('[itemprop="image"]').first().attr("content") ||
    null;
  const ingredients = recipeEl
    .find('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const instructions = recipeEl
    .find('[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"] li')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return { title, image, ingredients, instructions };
}

function extractFromOpenGraph(
  $: cheerio.CheerioAPI,
  _url: string
): ScrapedRecipe | null {
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim();
  const image =
    $('meta[property="og:image"]').attr("content") || null;

  if (!title) return null;

  // Try to find ingredient/instruction lists heuristically
  const ingredients: string[] = [];
  const instructions: string[] = [];

  // Look for lists that might contain ingredients
  $("ul li, .ingredient, .ingredients li, [class*='ingredient'] li").each(
    (_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) {
        ingredients.push(text);
      }
    }
  );

  // Look for ordered lists or instruction-like elements
  $(
    "ol li, .instruction, .instructions li, .step, .steps li, [class*='instruction'] li, [class*='direction'] li, [class*='step'] li"
  ).each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 1000) {
      instructions.push(text);
    }
  });

  if (ingredients.length === 0 && instructions.length === 0) return null;

  return { title, image, ingredients, instructions };
}
