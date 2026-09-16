import * as cheerio from "cheerio";
import { scrapeRecipe } from "./scraper";
import type { ScrapedRecipe } from "@/types";

export interface CaptureSource {
  candidate: ScrapedRecipe | null;
  text: string;
  method: "structured" | "visible";
  warnings?: string[];
  titleEvidence?: {
    title: string;
    method: "structured" | "visible-heading";
  };
}

/** Only anchor a visible title inside an unambiguous content scope. */
function visibleTitle($: cheerio.CheerioAPI): string | undefined {
  const recipes = $("[itemtype~='https://schema.org/Recipe'],[itemtype~='http://schema.org/Recipe'],[itemtype='Recipe']");
  if (recipes.length > 1 || $("article").length > 1 || $("main").length > 1)
    return undefined;
  const scope = recipes.length ? recipes : $("article,main").first();
  if (!scope.length) return undefined;

  // Site identity and navigation headings are not recipe titles, even in main.
  const excluded = "header,nav,footer,aside,[role=banner],[role=navigation],.site-title,.site-name,.site-header,.site-branding,#site-title,#site-header";
  const headings = scope.find("h1").filter((_, element) =>
    $(element).closest(excluded).length === 0,
  );
  const names = recipes.length
    ? recipes.find('[itemprop~="name"]').filter((_, element) =>
        $(element).closest("[itemscope]")[0] === recipes[0] &&
        $(element).closest(excluded).length === 0,
      )
    : null;
  if (headings.length > 1 || (names && names.length > 1)) return undefined;
  const heading = headings.text().replace(/\s+/g, " ").trim();
  const name = names?.text().replace(/\s+/g, " ").trim();
  if (heading && name && heading !== name) return undefined;
  return name || heading || undefined;
}

/** Match identical wording and units while comparing explicit numeric facts. */
function numericFacts(value: string): { wording: string; values: string } {
  const fractions: Record<string, string> = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
  const text = value.toLowerCase().replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => ` ${fractions[fraction]}`);
  const values: number[] = [];
  const wording = text.replace(/\d+(?:\s+(?:and\s+)?\d+\s*\/\s*\d+|\s*\/\s*\d+|\.\d+)?/g, (token) => {
    const parts = token.replace(/and/g, "").trim().split(/\s+(?=\d+\s*\/)/);
    let amount = 0;
    for (const part of parts) {
      const fraction = part.split("/").map(Number);
      amount += fraction.length === 2 ? fraction[0] / fraction[1] : fraction[0];
    }
    values.push(amount);
    return "#";
  }).replace(/\s+/g, " ").trim();
  return { wording, values: JSON.stringify(values) };
}

/** Compare only marked recipe fields; article prose is not conflict evidence. */
function sourceWarnings($: cheerio.CheerioAPI, candidate: ScrapedRecipe): string[] {
  const warnings = new Set<string>();
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalized = (value: string) => clean(value).toLowerCase();
  const recipeScope = "[itemtype*='Recipe'],[class*='recipe'],[id*='recipe']";
  const excluded = "script,style,nav,footer,form,noscript,.site-header,[role=banner],[hidden],[aria-hidden=true],[style*='display:none'],[style*='display: none']";
  const visible = (element: Parameters<cheerio.CheerioAPI>[0]) =>
    $(element).closest(excluded).length === 0;
  const cardSelector = "[itemtype*='Recipe'],.recipe,.recipe-card,.wprm-recipe-container,.tasty-recipes";
  const cards = $(cardSelector).filter((_, element) =>
    visible(element) && $(element).parents(cardSelector).length === 0 &&
    $(element).find("li,[itemprop~=recipeIngredient]").length > 0);
  if (cards.length > 1) {
    return ["Review the source: multiple recipe cards make ingredient and serving comparisons uncertain."];
  }
  const range = /\b(\d+(?:\.\d+)?)\s*(?:to|[-–—])\s*(\d+(?:\.\d+)?)\b/i;
  const candidateRange = candidate.servings?.match(range);
  $("[itemprop~='recipeYield'],[class*='yield'],[class*='servings'],[class*='label']").each((_, element) => {
    const field = $(element);
    if (!visible(element) || !field.closest(recipeScope).length) return;
    // A short Yield/Servings label may have its value in a sibling element.
    const label = clean(field.text());
    const isServingLabel = /^(?:yield|servings|serves):?$/i.test(label);
    if (!isServingLabel && !field.is("[itemprop~='recipeYield'],[class*='yield'],[class*='servings']")) return;
    const value = isServingLabel ? clean(field.parent().text()) : label;
    if (value.length > 120) return;
    const match = value.match(range);
    if (match && Number(match[1]) < Number(match[2]) &&
      (!candidateRange || match[1] !== candidateRange[1] || match[2] !== candidateRange[2])) {
      warnings.add("Review servings: the recipe card shows a range missing from the imported serving count.");
    }
    const count = value.match(/^(?:(?:yield|servings|serves)\s*:?\s*)?(\d+)(?:\s+[a-z]+)?$/i);
    const canonicalCount = candidate.servings?.match(/^\s*(\d+)(?:\s+[a-z]+)?\s*$/i);
    if (!match && count && canonicalCount && Number(count[1]) !== Number(canonicalCount[1])) {
      warnings.add("Review servings: the recipe card and imported serving count differ.");
    }
  });

  // Recipe plugin class names and schema properties identify ingredient fields
  // without selecting arbitrary lists or headings elsewhere in an article.
  const regions = $("[class*='ingredient']").filter((_, element) => {
    const field = $(element);
    const marked = (field.attr("class") ?? "").split(/\s+/).some((name) =>
      /recipe.*ingredient|ingredient.*recipe/i.test(name));
    return visible(element) && (marked || field.closest("[itemtype*='Recipe']").length > 0) &&
      !field.is("article,main,body");
  });
  const ingredientText = normalized(candidate.ingredients.join("\n"));
  regions.find("h2,h3,h4,h5,h6,[class*='list-heading'],[class*='group-name']").each((_, element) => {
    const heading = $(element);
    const label = clean(heading.text()).replace(/:$/, "");
    if (!visible(element) || !label || label.length > 80 || /^ingredients?$/i.test(label)) return;
    // Require an actual following ingredient list, not a promotional heading.
    if (!heading.nextAll("ul,ol").length && !heading.parent().find("ul,ol").length) return;
    if (!ingredientText.includes(normalized(label))) {
      warnings.add("Review ingredient groups: recipe-card sections are missing from the imported ingredient list.");
    }
  });
  const rows = regions.find("li,p").add(regions.filter((_, element) =>
    $(element).find("li,p").length === 0)).add($("[itemprop~='recipeIngredient']"));
  const hasAmount = /^\s*(?:\d|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/u;
  rows.each((_, element) => {
    if (!visible(element)) return;
    const row = normalized($(element).text());
    if (!hasAmount.test(row) || row.length > 600) return;
    const matching = candidate.ingredients.filter((ingredient) => {
      const name = normalized(ingredient);
      return name.length >= 4 && !hasAmount.test(name) && row.endsWith(name) &&
        /\s$/.test(row.slice(0, row.length - name.length));
    });
    if (matching.length === 1) {
      warnings.add("Review ingredient amounts: the recipe card includes an amount missing from the imported ingredient list.");
    }
    const facts = numericFacts(row);
    const quantifiedMatches = candidate.ingredients.filter((ingredient) =>
      hasAmount.test(ingredient) && numericFacts(ingredient).wording === facts.wording);
    if (quantifiedMatches.length && quantifiedMatches.every((ingredient) =>
      numericFacts(ingredient).values !== facts.values)) {
      warnings.add("Review ingredient amounts: the recipe card and imported ingredient list show different amounts.");
    }
  });
  const instructions = $("[class*='instruction'],[itemprop~='recipeInstructions']").filter((_, element) => {
    const field = $(element);
    const marked = (field.attr("class") ?? "").split(/\s+/).some((name) =>
      /recipe.*instruction|instruction.*recipe/i.test(name));
    return visible(element) && (marked || field.is("[itemprop~='recipeInstructions']"));
  });
  instructions.find("li,p").add(instructions).each((_, element) => {
    if (!visible(element)) return;
    const text = clean($(element).text());
    if (text.length > 3000) return;
    const facts = numericFacts(text);
    if (facts.values === "[]") return;
    const matchingSteps = candidate.instructions.filter((step) => numericFacts(step).wording === facts.wording);
    if (matchingSteps.length && matchingSteps.every((step) => numericFacts(step).values !== facts.values)) {
      warnings.add("Review instructions: the recipe card and imported steps show different numbers.");
    }
  });
  return [...warnings];
}

export function selectCaptureSource(html: string, url: string): CaptureSource {
  let extractionMethod = "visible";
  const candidate = scrapeRecipe(html, url, (method) => {
    extractionMethod = method;
  });
  const $ = cheerio.load(html);
  const warnings = ["jsonld", "microdata"].includes(extractionMethod) && candidate
    ? sourceWarnings($, candidate) : [];
  $(
    "script,style,nav,footer,header,aside,form,noscript,[hidden],[aria-hidden=true]",
  ).remove();
  const structured = ["jsonld", "microdata"].includes(extractionMethod);
  // The scraper supplies this placeholder when the source has no name.
  const structuredTitle = structured && candidate?.title.trim() &&
    candidate.title !== "Untitled Recipe" ? candidate.title : undefined;
  const headingTitle = structuredTitle ? undefined : visibleTitle($);
  const titleEvidence: CaptureSource["titleEvidence"] = structuredTitle
    ? { title: structuredTitle, method: "structured" }
    : headingTitle
      ? { title: headingTitle, method: "visible-heading" }
      : undefined;
  const root = $("[itemtype*='Recipe'], article, main").first();
  $("li,p,h1,h2,h3,h4,br,section,div").each((_, element) => {
    $(element).append("\n");
  });
  const text = (root.length ? root.text() : $("body").text())
    .replace(/[\t \r]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  const complete =
    ["jsonld", "microdata"].includes(extractionMethod) &&
    !!candidate?.ingredients.length &&
    !!candidate?.instructions.length;
  const selected = complete
    ? JSON.stringify({ candidate, visibleText: text })
    : structured && candidate
      ? [
          JSON.stringify({ candidate, visibleText: text }),
          ...Object.values(candidate)
            .flat()
            .filter((value): value is string => typeof value === "string"),
          text,
        ].join("\n")
      : text;
  if (Buffer.byteLength(selected, "utf8") > 48 * 1024)
    throw new Error("SOURCE_TOO_LARGE");
  return {
    candidate,
    ...(warnings.length ? { warnings } : {}),
    text: selected,
    method: complete ? "structured" : "visible",
    ...(titleEvidence && titleEvidence.title.length <= 300 &&
      selected.includes(titleEvidence.title) ? { titleEvidence } : {}),
  };
}
