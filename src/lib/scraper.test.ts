import { describe, it, expect } from "vitest";
import { scrapeRecipe } from "./scraper";

// Helper to wrap JSON-LD in a minimal HTML document
function htmlWithJsonLd(jsonLd: object): string {
  return `
    <html>
      <head>
        <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      </head>
      <body></body>
    </html>
  `;
}

describe("scrapeRecipe", () => {
  // ──────────────────────────────────────────
  // JSON-LD Tests
  // ──────────────────────────────────────────

  describe("JSON-LD extraction", () => {
    it("1. extracts basic recipe from JSON-LD (name, ingredients, instructions, image)", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Classic Pancakes",
        image: "https://example.com/pancakes.jpg",
        recipeIngredient: [
          "2 cups all-purpose flour",
          "2 eggs",
          "1 cup milk",
          "2 tbsp butter, melted",
        ],
        recipeInstructions: [
          "Mix the dry ingredients together.",
          "Add eggs and milk, stir until smooth.",
          "Cook on a hot griddle until bubbles form, then flip.",
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/pancakes");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Classic Pancakes");
      expect(result!.image).toBe("https://example.com/pancakes.jpg");
      expect(result!.ingredients).toEqual([
        "2 cups all-purpose flour",
        "2 eggs",
        "1 cup milk",
        "2 tbsp butter, melted",
      ]);
      expect(result!.instructions).toEqual([
        "Mix the dry ingredients together.",
        "Add eggs and milk, stir until smooth.",
        "Cook on a hot griddle until bubbles form, then flip.",
      ]);
    });

    it("2. extracts recipe from JSON-LD with @graph wrapper (WordPress style)", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "My Food Blog",
            url: "https://myfoodblog.com",
          },
          {
            "@type": "Recipe",
            name: "WordPress Beef Stew",
            image: "https://myfoodblog.com/stew.jpg",
            recipeIngredient: [
              "2 lbs beef chuck, cubed",
              "4 carrots, sliced",
              "3 potatoes, diced",
            ],
            recipeInstructions: [
              "Brown the beef in a Dutch oven.",
              "Add vegetables and broth, simmer for 2 hours.",
            ],
          },
        ],
      });

      const result = scrapeRecipe(html, "https://myfoodblog.com/stew");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("WordPress Beef Stew");
      expect(result!.ingredients).toHaveLength(3);
      expect(result!.instructions).toHaveLength(2);
    });

    it("3. extracts recipe from JSON-LD wrapped in an array", () => {
      const html = htmlWithJsonLd([
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          name: "Array-Wrapped Salad",
          recipeIngredient: ["1 head romaine lettuce", "1/2 cup croutons", "Parmesan cheese"],
          recipeInstructions: ["Toss all ingredients together.", "Drizzle with dressing."],
        },
      ]);

      const result = scrapeRecipe(html, "https://example.com/salad");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Array-Wrapped Salad");
      expect(result!.ingredients).toHaveLength(3);
    });

    it("4. extracts instructions from HowToStep objects", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Grilled Cheese Sandwich",
        recipeIngredient: ["2 slices bread", "2 slices cheddar cheese", "1 tbsp butter"],
        recipeInstructions: [
          {
            "@type": "HowToStep",
            text: "Butter one side of each bread slice.",
          },
          {
            "@type": "HowToStep",
            text: "Place cheese between the unbuttered sides.",
          },
          {
            "@type": "HowToStep",
            text: "Cook in a skillet over medium heat until golden on both sides.",
          },
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/grilled-cheese");

      expect(result).not.toBeNull();
      expect(result!.instructions).toEqual([
        "Butter one side of each bread slice.",
        "Place cheese between the unbuttered sides.",
        "Cook in a skillet over medium heat until golden on both sides.",
      ]);
    });

    it("5. extracts instructions from HowToSection objects", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Layered Cake",
        recipeIngredient: ["2 cups flour", "1 cup sugar", "3 eggs", "1 cup frosting"],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Make the cake",
            itemListElement: [
              { "@type": "HowToStep", text: "Preheat oven to 350F." },
              { "@type": "HowToStep", text: "Mix dry ingredients together." },
              { "@type": "HowToStep", text: "Bake for 30 minutes." },
            ],
          },
          {
            "@type": "HowToSection",
            name: "Frost the cake",
            itemListElement: [
              { "@type": "HowToStep", text: "Let the cake cool completely." },
              { "@type": "HowToStep", text: "Apply frosting evenly." },
            ],
          },
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/cake");

      expect(result).not.toBeNull();
      expect(result!.instructions).toEqual([
        "Preheat oven to 350F.",
        "Mix dry ingredients together.",
        "Bake for 30 minutes.",
        "Let the cake cool completely.",
        "Apply frosting evenly.",
      ]);
    });

    it("6. extracts metadata (prepTime, cookTime, totalTime, servings, author, cuisineType)", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Thai Green Curry",
        recipeIngredient: ["400ml coconut milk", "2 tbsp green curry paste", "500g chicken thigh"],
        recipeInstructions: ["Heat coconut milk.", "Add curry paste and chicken.", "Simmer 20 minutes."],
        prepTime: "PT15M",
        cookTime: "PT25M",
        totalTime: "PT40M",
        recipeYield: "4 servings",
        author: "Chef Noi",
        recipeCuisine: "Thai",
      });

      const result = scrapeRecipe(html, "https://example.com/thai-curry");

      expect(result).not.toBeNull();
      expect(result!.prepTime).toBe("PT15M");
      expect(result!.cookTime).toBe("PT25M");
      expect(result!.totalTime).toBe("PT40M");
      expect(result!.servings).toBe("4");
      expect(result!.author).toBe("Chef Noi");
      expect(result!.cuisineType).toBe("Thai");
    });

    it("7. extracts author from an object with name property", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Author Object Recipe",
        recipeIngredient: ["1 cup rice"],
        recipeInstructions: ["Cook the rice."],
        author: { "@type": "Person", name: "Julia Child" },
      });

      const result = scrapeRecipe(html, "https://example.com/author-obj");

      expect(result).not.toBeNull();
      expect(result!.author).toBe("Julia Child");
    });

    it("8. extracts servings from recipeYield as a number", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Numeric Yield Recipe",
        recipeIngredient: ["1 lb pasta"],
        recipeInstructions: ["Boil pasta."],
        recipeYield: 6,
      });

      const result = scrapeRecipe(html, "https://example.com/numeric-yield");

      expect(result).not.toBeNull();
      expect(result!.servings).toBe("6");
    });

    it("8b. extracts servings from recipeYield as a string", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "String Yield Recipe",
        recipeIngredient: ["1 lb pasta"],
        recipeInstructions: ["Boil pasta."],
        recipeYield: "8 servings",
      });

      const result = scrapeRecipe(html, "https://example.com/string-yield");

      expect(result).not.toBeNull();
      expect(result!.servings).toBe("8");
    });

    it("9a. extracts image from a string value", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "String Image Recipe",
        image: "https://example.com/photo.jpg",
        recipeIngredient: ["1 egg"],
        recipeInstructions: ["Fry the egg."],
      });

      const result = scrapeRecipe(html, "https://example.com/img-string");

      expect(result).not.toBeNull();
      expect(result!.image).toBe("https://example.com/photo.jpg");
    });

    it("9b. extracts image from an object with url property", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Object Image Recipe",
        image: { "@type": "ImageObject", url: "https://example.com/object-photo.jpg" },
        recipeIngredient: ["1 egg"],
        recipeInstructions: ["Fry the egg."],
      });

      const result = scrapeRecipe(html, "https://example.com/img-object");

      expect(result).not.toBeNull();
      expect(result!.image).toBe("https://example.com/object-photo.jpg");
    });

    it("9c. extracts image from an array", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Array Image Recipe",
        image: [
          "https://example.com/array-photo-1.jpg",
          "https://example.com/array-photo-2.jpg",
        ],
        recipeIngredient: ["1 egg"],
        recipeInstructions: ["Fry the egg."],
      });

      const result = scrapeRecipe(html, "https://example.com/img-array");

      expect(result).not.toBeNull();
      expect(result!.image).toBe("https://example.com/array-photo-1.jpg");
    });

    it("extracts servings from yield field (not recipeYield)", () => {
      // Some sites use "yield" instead of "recipeYield"
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Yield Field Recipe",
        recipeIngredient: ["1 cup rice"],
        recipeInstructions: ["Cook rice."],
        yield: "6",
      });
      const result = scrapeRecipe(html, "https://example.com/yield-field");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("6");
    });

    it("prefers recipeYield over yield when both present", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Both Yield Recipe",
        recipeIngredient: ["1 cup flour"],
        recipeInstructions: ["Mix."],
        recipeYield: "4 servings",
        yield: "8",
      });
      const result = scrapeRecipe(html, "https://example.com/both-yield");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("4");
    });

    it("falls back to HTML text when JSON-LD has no yield info", () => {
      // JSON-LD has recipe but no servings; page text has "Yield: 6"
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "No Yield JSON-LD",
              recipeIngredient: ["1 cup flour"],
              recipeInstructions: ["Mix."],
            })}</script>
          </head>
          <body>
            <span class="recipe-yield">Yield: 6</span>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/no-yield-jsonld");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("6");
    });

    it("10. returns null when no recipe data is found in JSON-LD", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Best Restaurants in New York",
        author: "Food Critic",
      });

      const result = scrapeRecipe(html, "https://example.com/article");

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // Microdata Tests
  // ──────────────────────────────────────────

  describe("Microdata extraction", () => {
    it("11. extracts basic recipe from microdata with itemtype schema.org/Recipe", () => {
      const html = `
        <html>
          <body>
            <div itemscope itemtype="https://schema.org/Recipe">
              <h1 itemprop="name">Microdata Tomato Soup</h1>
              <img itemprop="image" src="https://example.com/soup.jpg" />
              <ul>
                <li itemprop="recipeIngredient">4 large tomatoes</li>
                <li itemprop="recipeIngredient">1 onion, diced</li>
                <li itemprop="recipeIngredient">2 cups vegetable broth</li>
              </ul>
              <div itemprop="recipeInstructions">
                <ol>
                  <li>Saut&eacute; onion until soft.</li>
                  <li>Add tomatoes and broth, simmer 20 min.</li>
                  <li>Blend until smooth.</li>
                </ol>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/tomato-soup");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Microdata Tomato Soup");
      expect(result!.image).toBe("https://example.com/soup.jpg");
      expect(result!.ingredients).toEqual([
        "4 large tomatoes",
        "1 onion, diced",
        "2 cups vegetable broth",
      ]);
      expect(result!.instructions).toHaveLength(3);
      expect(result!.instructions[0]).toContain("onion until soft");
    });

    it("12. extracts microdata metadata (prepTime, cookTime from content attributes)", () => {
      const html = `
        <html>
          <body>
            <div itemscope itemtype="https://schema.org/Recipe">
              <h1 itemprop="name">Metadata Microdata Recipe</h1>
              <meta itemprop="prepTime" content="PT10M" />
              <meta itemprop="cookTime" content="PT30M" />
              <meta itemprop="totalTime" content="PT40M" />
              <span itemprop="recipeYield">4 servings</span>
              <span itemprop="author">Gordon Ramsay</span>
              <ul>
                <li itemprop="recipeIngredient">1 lb beef</li>
                <li itemprop="recipeIngredient">Salt and pepper</li>
              </ul>
              <div itemprop="recipeInstructions">
                <ol>
                  <li>Season the beef.</li>
                  <li>Sear on high heat.</li>
                </ol>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/microdata-meta");

      expect(result).not.toBeNull();
      expect(result!.prepTime).toBe("PT10M");
      expect(result!.cookTime).toBe("PT30M");
      expect(result!.totalTime).toBe("PT40M");
      expect(result!.servings).toBe("4");
      expect(result!.author).toBe("Gordon Ramsay");
    });
    it("extracts servings from yield itemprop", () => {
      const html = `
        <html><body>
          <div itemscope itemtype="https://schema.org/Recipe">
            <h1 itemprop="name">Yield Itemprop Recipe</h1>
            <span itemprop="yield">8</span>
            <ul>
              <li itemprop="recipeIngredient">1 cup rice</li>
            </ul>
            <div itemprop="recipeInstructions"><ol><li>Cook.</li></ol></div>
          </div>
        </body></html>
      `;
      const result = scrapeRecipe(html, "https://example.com/yield-itemprop");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("8");
    });

    it("extracts servings from recipeYield content attribute", () => {
      const html = `
        <html><body>
          <div itemscope itemtype="https://schema.org/Recipe">
            <h1 itemprop="name">Content Attr Recipe</h1>
            <meta itemprop="recipeYield" content="10" />
            <ul>
              <li itemprop="recipeIngredient">1 cup rice</li>
            </ul>
            <div itemprop="recipeInstructions"><ol><li>Cook.</li></ol></div>
          </div>
        </body></html>
      `;
      const result = scrapeRecipe(html, "https://example.com/content-attr");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("10");
    });
  });

  // ──────────────────────────────────────────
  // Open Graph Tests
  // ──────────────────────────────────────────

  describe("Open Graph fallback extraction", () => {
    it("13. falls back to OpenGraph with og:title and heuristic ingredients", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Amazing Pasta Recipe" />
            <meta property="og:image" content="https://example.com/pasta-og.jpg" />
          </head>
          <body>
            <ul class="ingredients">
              <li>200g spaghetti</li>
              <li>100g pancetta</li>
              <li>2 egg yolks</li>
              <li>50g pecorino cheese</li>
            </ul>
            <ol>
              <li>Boil the spaghetti until al dente.</li>
              <li>Fry the pancetta until crispy.</li>
              <li>Toss pasta with egg yolks and cheese.</li>
            </ol>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/pasta-og");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Amazing Pasta Recipe");
      expect(result!.image).toBe("https://example.com/pasta-og.jpg");
      expect(result!.ingredients.length).toBeGreaterThan(0);
      expect(result!.instructions.length).toBeGreaterThan(0);
    });

    it("14. deduplicates ingredients in OpenGraph extraction", () => {
      // The OG fallback uses seenIngredients to dedup. We need items that appear
      // in multiple matching selectors. For instance, <li> inside .ingredients
      // matches both ".ingredients li" and "ul li".
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Dedup Recipe" />
          </head>
          <body>
            <ul class="ingredients">
              <li>1 cup flour</li>
              <li>1 cup sugar</li>
              <li>1 cup flour</li>
            </ul>
            <ol>
              <li>Mix together.</li>
            </ol>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/dedup");

      expect(result).not.toBeNull();
      // "1 cup flour" should appear only once despite being listed twice
      const flourCount = result!.ingredients.filter(
        (i) => i.toLowerCase() === "1 cup flour"
      ).length;
      expect(flourCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────
  // HTML Servings Fallback Tests
  // ──────────────────────────────────────────

  describe("HTML servings fallback", () => {
    it("finds servings from CSS class pattern", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "CSS Class Servings",
              recipeIngredient: ["1 egg"],
              recipeInstructions: ["Fry."],
            })}</script>
          </head>
          <body>
            <div class="recipe-servings">4</div>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/css-servings");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("4");
    });

    it("finds servings from 'Serves N' text pattern", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "Serves Pattern Recipe",
              recipeIngredient: ["1 cup flour"],
              recipeInstructions: ["Bake."],
            })}</script>
          </head>
          <body>
            <p>Serves 8</p>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/serves-text");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("8");
    });

    it("finds servings from 'Yield: N' text pattern", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "Yield Text Recipe",
              recipeIngredient: ["2 eggs"],
              recipeInstructions: ["Scramble."],
            })}</script>
          </head>
          <body>
            <span>Yield: 12</span>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/yield-text");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("12");
    });

    it("finds servings from data-servings attribute", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "Data Attr Recipe",
              recipeIngredient: ["1 cup milk"],
              recipeInstructions: ["Pour."],
            })}</script>
          </head>
          <body>
            <div class="servings-control" data-servings="6">6 servings</div>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/data-attr");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("6");
    });

    it("finds servings from WordPress recipe plugin classes", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "WP Plugin Recipe",
              recipeIngredient: ["1 cup flour"],
              recipeInstructions: ["Mix."],
            })}</script>
          </head>
          <body>
            <span class="wprm-recipe-servings">4</span>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/wprm");
      expect(result).not.toBeNull();
      expect(result!.servings).toBe("4");
    });

    it("does not pick up servings from unrelated long text", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "Long Text Recipe",
              recipeIngredient: ["1 cup flour"],
              recipeInstructions: ["Mix."],
              recipeYield: "4",
            })}</script>
          </head>
          <body>
            <p>This recipe serves the whole family. Originally it makes enough for a party of 20 people but we scaled it down.</p>
          </body>
        </html>
      `;
      const result = scrapeRecipe(html, "https://example.com/long-text");
      expect(result).not.toBeNull();
      // Should use JSON-LD value, not the paragraph text
      expect(result!.servings).toBe("4");
    });
  });

  // ──────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────

  describe("Edge cases", () => {
    it("15. returns null for empty HTML", () => {
      const result = scrapeRecipe("", "https://example.com/empty");
      expect(result).toBeNull();
    });

    it("16. returns null for HTML with no recipe data", () => {
      const html = `
        <html>
          <head><title>My Blog</title></head>
          <body>
            <h1>Welcome to my blog</h1>
            <p>This is a personal blog about travel.</p>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/blog");
      expect(result).toBeNull();
    });

    it("17. handles malformed JSON-LD gracefully (does not throw)", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">{ this is not valid json }</script>
          </head>
          <body></body>
        </html>
      `;

      expect(() => scrapeRecipe(html, "https://example.com/malformed")).not.toThrow();
      const result = scrapeRecipe(html, "https://example.com/malformed");
      expect(result).toBeNull();
    });

    it("18. handles recipe with ingredients but no instructions", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Ingredients Only Recipe",
        recipeIngredient: ["1 cup oats", "1 banana", "1 tbsp honey"],
      });

      const result = scrapeRecipe(html, "https://example.com/ingredients-only");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Ingredients Only Recipe");
      expect(result!.ingredients).toHaveLength(3);
      expect(result!.instructions).toHaveLength(0);
    });

    it("19. handles recipe with instructions but no ingredients", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Instructions Only Recipe",
        recipeInstructions: [
          "Preheat the oven to 400F.",
          "Place items on a baking sheet.",
          "Bake for 25 minutes.",
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/instructions-only");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Instructions Only Recipe");
      expect(result!.ingredients).toHaveLength(0);
      expect(result!.instructions).toHaveLength(3);
    });

    it("20. returns null when both ingredients and instructions are empty", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Empty Recipe",
        recipeIngredient: [],
        recipeInstructions: [],
      });

      const result = scrapeRecipe(html, "https://example.com/empty-recipe");

      expect(result).toBeNull();
    });
  });
});
