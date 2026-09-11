/**
 * Core-loop smoke test: login → scrape → save → plan → shop → check.
 *
 * The scrape network call is mocked (deterministic fixture); everything
 * after it runs for real against the Convex dev deployment. Sign-in uses
 * Clerk's testing token. Requires a DISPOSABLE Clerk dev-instance user
 * named by E2E_CLERK_USER_EMAIL; the spec cleans up the
 * recipe it creates but is not guaranteed to leave zero residue on failure.
 */

import { test, expect } from "@playwright/test";

const RECIPE_TITLE = `E2E Pasta ${Date.now()}`;

const FIXTURE_RECIPE = {
  title: RECIPE_TITLE,
  image: null,
  ingredients: ["8 oz e2e-spaghetti", "1 cup e2e-tomato sauce"],
  instructions: ["Boil the pasta.", "Simmer the sauce.", "Combine and serve."],
  prepTime: null,
  cookTime: null,
  totalTime: null,
  servings: "2",
  author: null,
  cuisineType: null,
};

test.describe("core loop", () => {
  test.skip(
    !process.env.E2E_CLERK_USER_EMAIL,
    "Set E2E_CLERK_USER_EMAIL (a Clerk dev-instance test user) to run"
  );

  test("login → scrape → save → plan → shop → check", async ({ page }) => {
    // Deterministic scrape — no external network
    await page.route("**/api/scrape", (route) =>
      route.fulfill({ json: FIXTURE_RECIPE })
    );

    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("nonce-");
    expect(csp).toContain("convex.cloud");

    // --- Scrape + save ---------------------------------------------------
    await page.getByLabel("Recipe URL").fill("https://example.com/e2e-pasta");
    await page.getByRole("button", { name: "Scrape recipe" }).click();
    await expect(page.getByText(`"${RECIPE_TITLE}" saved!`)).toBeVisible();

    // --- Assign to next Monday's dinner from the recipe card --------------
    await page.goto("/recipes");
    await expect(page.getByText(RECIPE_TITLE).first()).toBeVisible();
    await page.getByRole("button", { name: `Add ${RECIPE_TITLE} to meal plan` }).click();
    await page
      .getByRole("button", { name: new RegExp(`Add ${RECIPE_TITLE} to Mon Dinner`) })
      .click();

    // --- Generate the shopping list for that week -------------------------
    await page.goto("/meal-plan");
    await expect(page.getByText(RECIPE_TITLE).first()).toBeVisible();
    await page.getByRole("button", { name: "Shopping List" }).click();
    await expect(
      page.getByText("Shopping list generated from this week's meals")
    ).toBeVisible();

    // --- Check an item off ------------------------------------------------
    await page.goto("/shopping-list");
    const item = page.getByText(/e2e-spaghetti/).first();
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByText(/e2e-spaghetti/).first()).toHaveClass(/line-through/);

    // --- Cleanup: delete the recipe (cascades plan + unlinks list) ---------
    await page.goto("/recipes");
    await page.getByText(RECIPE_TITLE).first().click();
    await page.getByRole("button", { name: /delete/i }).first().click();
    const confirm = page.getByRole("button", { name: /^delete/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
  });
});
