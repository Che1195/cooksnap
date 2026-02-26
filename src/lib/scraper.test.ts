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

    it("splits concatenated numbered steps in a single HowToStep", () => {
      // Some sites (e.g. halfbakedharvest.com) put all steps in one HowToStep
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Honey Garlic Chicken",
        recipeIngredient: ["1 lb chicken", "2 tbsp honey"],
        recipeInstructions: [
          {
            "@type": "HowToStep",
            text: "1. Preheat the oven to 450° F. Line a baking sheet with parchment paper.2. On the sheet pan, mix the chicken and spices. Add 2 tablespoons olive oil.3. Meanwhile, make the sauce. In a bowl, combine all ingredients.4. Pour the sauce over the chicken. Bake for another 5 minutes.5. Serve with green onions and sesame seeds.",
          },
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/honey-garlic");

      expect(result).not.toBeNull();
      expect(result!.instructions).toHaveLength(5);
      expect(result!.instructions[0]).toBe(
        "Preheat the oven to 450° F. Line a baking sheet with parchment paper."
      );
      expect(result!.instructions[1]).toContain("On the sheet pan");
      expect(result!.instructions[2]).toContain("Meanwhile");
      expect(result!.instructions[3]).toContain("Pour the sauce");
      expect(result!.instructions[4]).toContain("Serve with green onions");
    });

    it("does not split instructions that don't start with '1.'", () => {
      const html = htmlWithJsonLd({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Normal Steps",
        recipeIngredient: ["1 egg"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "Preheat the oven to 350." },
          { "@type": "HowToStep", text: "Bake for 25 minutes." },
        ],
      });

      const result = scrapeRecipe(html, "https://example.com/normal");
      expect(result).not.toBeNull();
      expect(result!.instructions).toHaveLength(2);
      expect(result!.instructions[0]).toBe("Preheat the oven to 350.");
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

  // ──────────────────────────────────────────
  // OG Fallback – non-ingredient filtering
  // ──────────────────────────────────────────

  describe("OG fallback ingredient filtering", () => {
    it("excludes nav/footer/sidebar list items from ingredients", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Sweet Chicken Recipe" />
            <meta property="og:image" content="https://example.com/img.jpg" />
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org/",
              "@type": "recipe",
              name: "Sweet Chicken Recipe",
              image: "https://example.com/img.jpg",
              aggregateRating: { "@type": "AggregateRating", ratingValue: "5" },
            })}</script>
          </head>
          <body>
            <nav>
              <ul>
                <li>Home</li>
                <li>Recipes</li>
                <li>About</li>
                <li>Contact</li>
              </ul>
            </nav>
            <article>
              <h2>Ingredients</h2>
              <ul>
                <li>1½ pounds boneless chicken thighs</li>
                <li>2 teaspoons cornstarch</li>
                <li>1 tablespoon soy sauce</li>
              </ul>
              <h2>Instructions</h2>
              <ol>
                <li>Season the chicken with cornstarch.</li>
                <li>Pan-fry until golden brown.</li>
              </ol>
            </article>
            <footer>
              <ul>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </footer>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/chicken");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toEqual([
        "1½ pounds boneless chicken thighs",
        "2 teaspoons cornstarch",
        "1 tablespoon soy sauce",
      ]);
      // Nav/footer items should NOT be in ingredients
      const allIngredientText = result!.ingredients.join(" ");
      expect(allIngredientText).not.toContain("Home");
      expect(allIngredientText).not.toContain("Recipes");
      expect(allIngredientText).not.toContain("Privacy Policy");
    });

    it("finds ingredients via heading proximity when no ingredient classes exist", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Brothy Rice" />
          </head>
          <body>
            <main>
              <h2>Ingredients</h2>
              <p><strong>CHICKEN</strong></p>
              <ul>
                <li>1½ pounds chicken thighs</li>
                <li>2 teaspoons cornstarch</li>
              </ul>
              <p><strong>SOY GLAZE</strong></p>
              <ul>
                <li>¼ cup soy sauce</li>
                <li>2 tablespoons honey</li>
              </ul>
              <h2>Instructions</h2>
              <ol>
                <li>Season the chicken.</li>
                <li>Make the glaze.</li>
              </ol>
            </main>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/rice");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toEqual([
        "1½ pounds chicken thighs",
        "2 teaspoons cornstarch",
        "¼ cup soy sauce",
        "2 tablespoons honey",
      ]);
    });
  });

  describe("OG fallback with recipe-card metadata", () => {
    it("extracts Yields as servings", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Test Recipe" />
          </head>
          <body>
            <div class="recipe-time">
              <div><label>Yields:</label> <span>4</span></div>
            </div>
            <div class="recipe-ingredient">
              <h4>Ingredients</h4>
              <ul>
                <li>1 cup flour</li>
                <li>2 eggs</li>
                <li>1 cup milk</li>
              </ul>
            </div>
            <ol><li>Mix ingredients.</li><li>Bake at 350.</li></ol>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/yields-test");

      expect(result).not.toBeNull();
      expect(result!.servings).toBe("4");
    });

    it("extracts prep/cook/total times from label+span structure", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Time Recipe" />
          </head>
          <body>
            <div class="recipe-time">
              <div><label>Prep Time:</label> <span>15 minutes</span></div>
              <div><label>Cook Time:</label> <span>25 minutes</span></div>
              <div><label>Total Time:</label> <span>40 minutes</span></div>
            </div>
            <div class="recipe-ingredient">
              <h4>Ingredients</h4>
              <ul>
                <li>1 cup flour</li>
                <li>2 eggs</li>
                <li>1 cup milk</li>
              </ul>
            </div>
            <ol><li>Mix ingredients together.</li><li>Bake at 350 degrees.</li></ol>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/time-test");

      expect(result).not.toBeNull();
      expect(result!.prepTime).toBe("PT15M");
      expect(result!.cookTime).toBe("PT25M");
      expect(result!.totalTime).toBe("PT40M");
    });

    it("extracts ingredient group headers from h5/strong in recipe-ingredient container", () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Grouped Recipe" />
          </head>
          <body>
            <div class="recipe-ingredient">
              <h4>Ingredients</h4>
              <h5><strong>CHICKEN</strong></h5>
              <ul>
                <li>1½ pounds chicken thighs</li>
                <li>2 teaspoons cornstarch</li>
              </ul>
              <h5><strong>SOY GLAZE SAUCE</strong></h5>
              <ul>
                <li>2 tablespoons honey</li>
                <li>¼ cup soy sauce</li>
              </ul>
              <strong>BROTH</strong>
              <ul>
                <li>3 tablespoons butter</li>
                <li>1 cup half and half</li>
              </ul>
              <h5><strong>FOR SERVING</strong></h5>
              <ul>
                <li>Cooked jasmine rice</li>
                <li>Sliced green onions</li>
              </ul>
            </div>
            <ol><li>Cook the chicken until golden.</li><li>Make the glaze.</li></ol>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/grouped-test");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toContain("## CHICKEN:");
      expect(result!.ingredients).toContain("## SOY GLAZE SAUCE:");
      expect(result!.ingredients).toContain("## BROTH:");
      expect(result!.ingredients).toContain("## FOR SERVING:");
      expect(result!.ingredients).toContain("1½ pounds chicken thighs");
      expect(result!.ingredients).toContain("2 tablespoons honey");
      expect(result!.ingredients).toContain("3 tablespoons butter");
      expect(result!.ingredients).toContain("Cooked jasmine rice");
    });

    it("fills times from HTML even when JSON-LD has recipe data", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "Timed Recipe",
              recipeIngredient: ["1 cup flour", "2 eggs"],
              recipeInstructions: ["Mix flour and eggs.", "Bake at 350F."],
            })}</script>
          </head>
          <body>
            <div class="recipe-time">
              <div><label>Prep Time:</label> <span>10 minutes</span></div>
              <div><label>Cook Time:</label> <span>30 minutes</span></div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/jsonld-time");

      expect(result).not.toBeNull();
      // JSON-LD has no times, should fill from HTML
      expect(result!.prepTime).toBe("PT10M");
      expect(result!.cookTime).toBe("PT30M");
    });
  });

  // ──────────────────────────────────────────
  // DOM Text Extraction (Strategy 4) Tests
  // ──────────────────────────────────────────

  describe("DOM text extraction (Strategy 4)", () => {
    it("extracts recipe from MUI-like nested div structure", () => {
      const html = `
        <html>
          <head><title>Lamb Kebabs</title></head>
          <body>
            <div class="MuiBox-root">
              <h1>Lamb Kebabs</h1>
              <div class="MuiBox-root">
                <p>Ingredients</p>
                <div class="MuiBox-root">
                  <div><span>1 lb ground lamb</span></div>
                  <div><span>1 tsp cumin</span></div>
                  <div><span>1/2 tsp salt</span></div>
                  <div><span>1/4 tsp black pepper</span></div>
                </div>
              </div>
              <div class="MuiBox-root">
                <p>Instructions</p>
                <div class="MuiBox-root">
                  <div><span>Mix lamb with spices in a large bowl until well combined.</span></div>
                  <div><span>Form mixture into kebab shapes around metal skewers.</span></div>
                  <div><span>Grill on medium-high heat for 8-10 minutes, turning occasionally.</span></div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/kebabs");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Lamb Kebabs");
      expect(result!.ingredients).toEqual([
        "1 lb ground lamb",
        "1 tsp cumin",
        "1/2 tsp salt",
        "1/4 tsp black pepper",
      ]);
      expect(result!.instructions).toHaveLength(3);
      expect(result!.instructions[0]).toContain("Mix lamb with spices");
    });

    it("handles heading with colon (Ingredients:)", () => {
      const html = `
        <html>
          <head><title>Quick Salad</title></head>
          <body>
            <h1>Quick Salad</h1>
            <div>
              <p>Ingredients:</p>
              <div><span>1 head romaine lettuce</span></div>
              <div><span>1/2 cup cherry tomatoes</span></div>
              <div><span>1/4 cup feta cheese</span></div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/salad");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toHaveLength(3);
      expect(result!.ingredients[0]).toBe("1 head romaine lettuce");
    });

    it("recognizes Directions, Steps, and Method as instruction headings", () => {
      for (const heading of ["Directions", "Steps", "Method"]) {
        const html = `
          <html>
            <head><title>Test Recipe</title></head>
            <body>
              <h1>Test Recipe</h1>
              <p>Ingredients</p>
              <div><span>2 cups flour</span></div>
              <div><span>1 cup water</span></div>
              <p>${heading}</p>
              <div><span>Combine the flour and water in a large mixing bowl.</span></div>
              <div><span>Knead the dough on a floured surface for ten minutes.</span></div>
            </body>
          </html>
        `;

        const result = scrapeRecipe(html, "https://example.com/test");
        expect(result).not.toBeNull();
        expect(result!.instructions.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("falls back to parent children when heading and content share a parent", () => {
      const html = `
        <html>
          <head><title>Shared Parent Recipe</title></head>
          <body>
            <h1>Shared Parent Recipe</h1>
            <div>
              <span>Ingredients</span>
              <span>2 cups rice</span>
              <span>1 can coconut milk</span>
              <span>1 tsp salt</span>
            </div>
            <div>
              <span>Instructions</span>
              <span>Rinse the rice thoroughly under cold water until clear.</span>
              <span>Combine rice and coconut milk in a pot and bring to boil.</span>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/shared");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toContain("2 cups rice");
      expect(result!.ingredients).toContain("1 can coconut milk");
      expect(result!.instructions.length).toBeGreaterThanOrEqual(2);
    });

    it("filters out UI noise (button text, nav labels)", () => {
      const html = `
        <html>
          <head><title>Noisy Recipe</title></head>
          <body>
            <h1>Noisy Recipe</h1>
            <div>
              <p>Ingredients</p>
              <div><span>1 cup oats</span></div>
              <div><button>Save Recipe</button></div>
              <div><span>1/2 cup honey</span></div>
              <div><span>2 tbsp peanut butter</span></div>
            </div>
            <div>
              <p>Instructions</p>
              <div><span>Mix oats and honey together in a large bowl until coated.</span></div>
              <div><button>Print Recipe</button></div>
              <div><span>Press mixture into a lined baking pan and refrigerate.</span></div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/noisy");

      expect(result).not.toBeNull();
      // Button text should be filtered out
      const allText = [...result!.ingredients, ...result!.instructions].join(" ");
      expect(allText).not.toContain("Save Recipe");
      expect(allText).not.toContain("Print Recipe");
      expect(result!.ingredients).toHaveLength(3);
    });

    it("does not trigger when Strategy 1-3 succeed", () => {
      // JSON-LD recipe should be returned by Strategy 1, not Strategy 4
      const html = `
        <html>
          <head>
            <script type="application/ld+json">${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Recipe",
              name: "JSON-LD Recipe",
              recipeIngredient: ["1 cup flour", "2 eggs"],
              recipeInstructions: ["Mix flour and eggs.", "Bake at 350F."],
            })}</script>
          </head>
          <body>
            <h1>JSON-LD Recipe</h1>
            <p>Ingredients</p>
            <div><span>WRONG ingredient from DOM</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/jsonld-priority");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("JSON-LD Recipe");
      expect(result!.ingredients).toEqual(["1 cup flour", "2 eggs"]);
    });

    it("returns null when no section headings are found", () => {
      const html = `
        <html>
          <head><title>About Us</title></head>
          <body>
            <h1>About Our Company</h1>
            <p>We are a tech company based in San Francisco.</p>
            <p>Founded in 2020, we build great products.</p>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/about");
      expect(result).toBeNull();
    });

    it("returns null when content is too sparse (below threshold)", () => {
      const html = `
        <html>
          <head><title>Sparse Recipe</title></head>
          <body>
            <h1>Sparse Recipe</h1>
            <p>Ingredients</p>
            <div><span>1 egg</span></div>
            <p>Instructions</p>
            <div><span>Fry it.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/sparse");
      // Only 1 ingredient and 0 instructions (too short), should be null
      expect(result).toBeNull();
    });

    it("splits concatenated numbered steps from DOM text", () => {
      const html = `
        <html>
          <head><title>Numbered Steps Recipe</title></head>
          <body>
            <h1>Numbered Steps Recipe</h1>
            <p>Ingredients</p>
            <div><span>2 cups flour</span></div>
            <div><span>1 cup sugar</span></div>
            <div><span>3 eggs</span></div>
            <p>Instructions</p>
            <div><span>1. Preheat the oven to 350 degrees. 2. Mix flour and sugar together in a bowl. 3. Add eggs and stir until smooth.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/numbered");

      expect(result).not.toBeNull();
      expect(result!.instructions).toHaveLength(3);
      expect(result!.instructions[0]).toContain("Preheat the oven");
      expect(result!.instructions[1]).toContain("Mix flour and sugar");
      expect(result!.instructions[2]).toContain("Add eggs");
    });

    it("marks section headers in ingredients (For the sauce:)", () => {
      const html = `
        <html>
          <head><title>Pasta with Sauce</title></head>
          <body>
            <h1>Pasta with Sauce</h1>
            <p>Ingredients</p>
            <div><span>For the pasta:</span></div>
            <div><span>1 lb spaghetti</span></div>
            <div><span>1 tbsp olive oil</span></div>
            <div><span>For the sauce:</span></div>
            <div><span>2 cups crushed tomatoes</span></div>
            <div><span>3 cloves garlic</span></div>
            <p>Instructions</p>
            <div><span>Boil pasta in salted water until al dente, then drain well.</span></div>
            <div><span>Sauté garlic in olive oil, add tomatoes, and simmer fifteen minutes.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/pasta-sauce");

      expect(result).not.toBeNull();
      // "For the pasta:" and "For the sauce:" should be marked as headers
      expect(result!.ingredients).toContain("## For the pasta:");
      expect(result!.ingredients).toContain("## For the sauce:");
      expect(result!.ingredients).toContain("1 lb spaghetti");
    });

    it("deduplicates ingredients (case-insensitive)", () => {
      const html = `
        <html>
          <head><title>Dedup Recipe</title></head>
          <body>
            <h1>Dedup Recipe</h1>
            <p>Ingredients</p>
            <div><span>1 cup flour</span></div>
            <div><span>1 Cup Flour</span></div>
            <div><span>2 eggs</span></div>
            <div><span>2 Eggs</span></div>
            <p>Instructions</p>
            <div><span>Mix flour and eggs together until a smooth batter forms.</span></div>
            <div><span>Pour batter into a greased pan and bake until golden.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/dedup");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toHaveLength(2);
    });

    it("handles wrapped heading text (span inside p)", () => {
      const html = `
        <html>
          <head><title>Wrapped Heading</title></head>
          <body>
            <h1>Wrapped Heading Recipe</h1>
            <p><span>Ingredients</span></p>
            <div><span>1 cup rice</span></div>
            <div><span>2 cups water</span></div>
            <div><span>1 tsp salt</span></div>
            <p><span>Instructions</span></p>
            <div><span>Rinse rice under cold water until the water runs clear.</span></div>
            <div><span>Bring water to a boil, add rice, then reduce to simmer.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/wrapped");

      expect(result).not.toBeNull();
      expect(result!.ingredients).toHaveLength(3);
      expect(result!.instructions).toHaveLength(2);
    });

    it("extracts ingredients from checkbox-based lists (ostarecipes.com pattern)", () => {
      const html = `
        <html>
          <head><title>Osta Recipes</title></head>
          <body>
            <p class="MuiTypography-root MuiTypography-h1">Sheet-Pan Chicken Fajitas</p>
            <div class="MuiStack-root">
              <p class="MuiTypography-root MuiTypography-h3">Chicken marinade</p>
              <hr>
              <div class="MuiStack-root">
                <label class="relative inline-block">
                  <input type="checkbox" class="hidden">
                </label>
                <div class="MuiStack-root">
                  <p class="MuiTypography-root MuiTypography-subtitle3">
                    <span class="MuiTypography-root MuiTypography-h5">2 lbs</span>boneless skinless chicken thighs</p>
                  <p class="MuiTypography-root MuiTypography-body2">sliced</p>
                </div>
              </div>
              <hr>
              <div class="MuiStack-root">
                <label class="relative inline-block">
                  <input type="checkbox" class="hidden">
                </label>
                <div class="MuiStack-root">
                  <p class="MuiTypography-root MuiTypography-subtitle3">
                    <span class="MuiTypography-root MuiTypography-h5">3 Tbs</span>mayonnaise</p>
                  <p class="MuiTypography-root MuiTypography-body2" hidden=""><!-- no note --></p>
                </div>
              </div>
              <hr>
              <p class="MuiTypography-root MuiTypography-h3">Veggies</p>
              <hr>
              <div class="MuiStack-root">
                <label class="relative inline-block">
                  <input type="checkbox" class="hidden">
                </label>
                <div class="MuiStack-root">
                  <p class="MuiTypography-root MuiTypography-subtitle3">
                    <span class="MuiTypography-root MuiTypography-h5">1 head</span>broccoli</p>
                  <p class="MuiTypography-root MuiTypography-body2">chopped</p>
                </div>
              </div>
            </div>
            <div>
              <p class="MuiTypography-root MuiTypography-h3">Instructions</p>
              <hr>
              <div class="MuiStack-root">
                <p class="MuiTypography-root MuiTypography-h2">1</p>
                <p class="MuiTypography-root MuiTypography-subtitle3">Add the sliced chicken to a bowl with mayo and toss until coated.</p>
              </div>
              <hr>
              <div class="MuiStack-root">
                <p class="MuiTypography-root MuiTypography-h2">2</p>
                <p class="MuiTypography-root MuiTypography-subtitle3">Preheat oven to 425 degrees and roast for twenty five minutes.</p>
              </div>
              <p class="MuiTypography-root MuiTypography-h3">Nutrition</p>
              <p>Calories: 500</p>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://ostarecipes.com/recipe/123");

      expect(result).not.toBeNull();
      // Title from MUI Typography-h1
      expect(result!.title).toBe("Sheet-Pan Chicken Fajitas");
      // Ingredients extracted from checkboxes with group headers
      expect(result!.ingredients).toContain("## Chicken marinade:");
      expect(result!.ingredients).toContain("## Veggies:");
      // Space-aware extraction: "2 lbs" + "boneless skinless chicken thighs" + ", sliced"
      expect(result!.ingredients).toContain("2 lbs boneless skinless chicken thighs, sliced");
      // Hidden note should not appear
      expect(result!.ingredients).toContain("3 Tbs mayonnaise");
      // Non-hidden note appended
      expect(result!.ingredients).toContain("1 head broccoli, chopped");
      // Instructions should be found and Nutrition should not be included
      expect(result!.instructions.length).toBeGreaterThanOrEqual(2);
      expect(result!.instructions[0]).toContain("sliced chicken");
      const allText = result!.instructions.join(" ");
      expect(allText).not.toContain("Calories");
    });

    it("expands 'each' ingredient lines into individual items", () => {
      const html = `
        <html>
          <head><title>Spice Test</title></head>
          <body>
            <p class="MuiTypography-root MuiTypography-h1">Spiced Chicken</p>
            <div>
              <p class="MuiTypography-root MuiTypography-h3">Marinade</p>
              <hr>
              <div class="MuiStack-root">
                <label><input type="checkbox"></label>
                <div>
                  <p><span>2 tsps</span>paprika, chili powder, cumin & cayenne</p>
                  <p>optional</p>
                </div>
              </div>
              <hr>
              <div class="MuiStack-root">
                <label><input type="checkbox"></label>
                <div>
                  <p><span>1 tsp</span>garlic powder, onion powder, salt, pepper</p>
                  <p>1 tsp each</p>
                </div>
              </div>
              <hr>
              <div class="MuiStack-root">
                <label><input type="checkbox"></label>
                <div>
                  <p><span>2 lbs</span>chicken thighs</p>
                  <p>sliced</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/spice-test");

      expect(result).not.toBeNull();
      // "2 tsps paprika, chili powder, cumin & cayenne" → 4 items (3+ items auto-expands)
      expect(result!.ingredients).toContain("2 tsps paprika");
      expect(result!.ingredients).toContain("2 tsps chili powder");
      expect(result!.ingredients).toContain("2 tsps cumin");
      expect(result!.ingredients).toContain("2 tsps cayenne");
      // "1 tsp garlic powder, onion powder, salt, pepper" with note "1 tsp each" → 4 items
      expect(result!.ingredients).toContain("1 tsp garlic powder");
      expect(result!.ingredients).toContain("1 tsp onion powder");
      expect(result!.ingredients).toContain("1 tsp salt");
      expect(result!.ingredients).toContain("1 tsp pepper");
      // Regular ingredient should NOT be expanded
      expect(result!.ingredients).toContain("2 lbs chicken thighs, sliced");
    });

    it("extracts title from MuiTypography-h1 when no native <h1> exists", () => {
      const html = `
        <html>
          <head>
            <title>Osta Recipes</title>
            <meta property="og:title" content="Osta Recipes – Discover Easy Home Recipes">
          </head>
          <body>
            <p class="MuiTypography-root MuiTypography-h1">Honey Garlic Shrimp</p>
            <p>Ingredients</p>
            <div><span>1 lb shrimp</span></div>
            <div><span>2 tbsp honey</span></div>
            <div><span>3 cloves garlic</span></div>
            <p>Instructions</p>
            <div><span>Combine honey and garlic in a bowl and mix until blended.</span></div>
            <div><span>Cook shrimp in a skillet with the honey garlic sauce for five min.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://ostarecipes.com/recipe/456");

      expect(result).not.toBeNull();
      // Should use MUI h1 text, not og:title (which has site-wide " – " pattern)
      expect(result!.title).toBe("Honey Garlic Shrimp");
    });

    it("skips og:title with site-wide separator pattern", () => {
      const html = `
        <html>
          <head>
            <title>My Site</title>
            <meta property="og:title" content="My Site – Best Recipes Online">
          </head>
          <body>
            <p>Ingredients</p>
            <div><span>1 cup flour</span></div>
            <div><span>2 eggs</span></div>
            <div><span>1 cup milk</span></div>
            <p>Instructions</p>
            <div><span>Mix all ingredients together until smooth and well combined.</span></div>
            <div><span>Pour into a pan and bake at three fifty for thirty minutes.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/recipe");

      expect(result).not.toBeNull();
      // Should fall through to <title> since og:title has " – " separator
      expect(result!.title).toBe("My Site");
    });

    it("extracts servings from 'N servings' pattern", () => {
      const html = `
        <html>
          <head><title>Servings Test</title></head>
          <body>
            <h1>Test Recipe</h1>
            <p>4 servings</p>
            <p>Ingredients</p>
            <div><span>1 cup rice</span></div>
            <div><span>2 cups water</span></div>
            <div><span>1 tsp salt</span></div>
            <p>Instructions</p>
            <div><span>Bring water to a boil and add rice and salt to the pot.</span></div>
            <div><span>Reduce heat to low and simmer covered for fifteen minutes.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/servings-test");

      expect(result).not.toBeNull();
      expect(result!.servings).toBe("4");
    });

    it("extracts prep and cook time from DOM text", () => {
      const html = `
        <html>
          <head><title>Time Test</title></head>
          <body>
            <h1>Timed Recipe</h1>
            <p>Prep : 20 min</p>
            <p>Cook : 60 min</p>
            <p>Ingredients</p>
            <div><span>1 lb chicken</span></div>
            <div><span>2 cups vegetables</span></div>
            <div><span>1 tbsp oil</span></div>
            <p>Instructions</p>
            <div><span>Season chicken with salt and pepper on both sides generously.</span></div>
            <div><span>Roast in the oven at four hundred degrees for sixty minutes.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/time-test");

      expect(result).not.toBeNull();
      expect(result!.prepTime).toBe("PT20M");
      expect(result!.cookTime).toBe("PT60M");
    });

    it("extracts recipe image from Firebase URL when og:image is generic", () => {
      const html = `
        <html>
          <head>
            <title>Image Test</title>
            <meta property="og:image" content="https://example.com/assets/preview.jpg">
          </head>
          <body>
            <h1>Image Recipe</h1>
            <img src="https://firebasestorage.googleapis.com/v0/b/app.firebasestorage.app/o/recipes%2Fmedia%2Fimage.png?alt=media" width="600" height="400">
            <p>Ingredients</p>
            <div><span>1 cup flour</span></div>
            <div><span>2 eggs</span></div>
            <div><span>1 tsp vanilla</span></div>
            <p>Instructions</p>
            <div><span>Mix all ingredients together until smooth batter forms nicely.</span></div>
            <div><span>Pour batter into a greased pan and bake until golden brown.</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/image-test");

      expect(result).not.toBeNull();
      expect(result!.image).toContain("firebasestorage.googleapis.com");
      expect(result!.image).toContain("recipes");
    });

    it("stops collecting instructions at Nutrition heading (MUI pattern)", () => {
      const html = `
        <html>
          <head><title>Stop Test</title></head>
          <body>
            <h1>Stop Heading Recipe</h1>
            <p>Ingredients</p>
            <div><span>1 cup rice</span></div>
            <div><span>2 cups water</span></div>
            <div><span>1 tsp salt</span></div>
            <p>Instructions</p>
            <div><span>Bring water to a boil and add rice and salt to the pot.</span></div>
            <div><span>Reduce heat to low and simmer covered for fifteen minutes.</span></div>
            <p class="MuiTypography-root MuiTypography-h3">Nutrition</p>
            <div><span>Calories: 200</span></div>
            <div><span>Protein: 5g</span></div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/stop-test");

      expect(result).not.toBeNull();
      expect(result!.instructions).toHaveLength(2);
      const allText = result!.instructions.join(" ");
      expect(allText).not.toContain("Calories");
      expect(allText).not.toContain("Protein");
    });

    it("handles space-aware text extraction (span+text concatenation)", () => {
      const html = `
        <html>
          <head><title>Space Test</title></head>
          <body>
            <h1>Space Aware Recipe</h1>
            <div>
              <label><input type="checkbox"></label>
              <div>
                <p><span>2 lbs</span>ground beef</p>
                <p>lean</p>
              </div>
            </div>
            <div>
              <label><input type="checkbox"></label>
              <div>
                <p><span>1 cup</span>chopped onions</p>
                <p hidden=""><!-- no note --></p>
              </div>
            </div>
            <div>
              <label><input type="checkbox"></label>
              <div>
                <p><span>3 cloves</span>garlic</p>
                <p>minced</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = scrapeRecipe(html, "https://example.com/space-test");

      expect(result).not.toBeNull();
      // Space should be inserted between span text and following text
      expect(result!.ingredients).toContain("2 lbs ground beef, lean");
      expect(result!.ingredients).toContain("1 cup chopped onions");
      expect(result!.ingredients).toContain("3 cloves garlic, minced");
    });
  });
});
