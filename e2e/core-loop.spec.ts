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
    await page.route("**/api/scrape", (route) => {
      const body = route.request().postDataJSON() as { importId: string };
      return route.fulfill({ json: { ...FIXTURE_RECIPE, importId: body.importId, warnings: [], needsReview: false } });
    });

    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("nonce-");
    expect(csp).toContain("convex.cloud");

    // The disposable account may have opted out during an earlier run.
    await page.goto("/profile");
    const reviewPreference = page.getByRole("checkbox", { name: "Review recipes before saving" });
    await expect(reviewPreference).toBeEnabled();
    const originallyReviewed = await reviewPreference.isChecked();
    if (!originallyReviewed) await reviewPreference.click();
    await expect(reviewPreference).toBeChecked();
    await expect(reviewPreference).toBeEnabled();
    await page.reload();
    await expect(reviewPreference).toBeChecked();
    await page.goto("/");

    // --- Scrape + save ---------------------------------------------------
    await page.getByLabel("Recipe URL").fill("https://example.com/e2e-pasta");
    await page.getByRole("button", { name: "Snap recipe" }).click();
    await expect(page.getByRole("heading", { name: "Review recipe" })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(RECIPE_TITLE);
    await page.getByLabel("Ingredient 2", { exact: true }).fill("2 cups e2e-tomato sauce");
    await page.getByRole("button", { name: "Save recipe", exact: true }).click();
    await expect(page.getByText(`"${RECIPE_TITLE}" saved!`)).toBeVisible();

    // --- Assign to next Monday's dinner from the recipe card --------------
    await page.goto("/recipes");
    await expect(page.getByText(RECIPE_TITLE).first()).toBeVisible();
    await page.getByRole("button", { name: `Add ${RECIPE_TITLE} to meal plan` }).click();
    await page
      .getByRole("button", { name: new RegExp(`Add ${RECIPE_TITLE} to Mon Dinner`) })
      .click();
    // Wait for the mutation to land before a full navigation, which would
    // otherwise tear down the Convex websocket with the write still in flight.
    await expect(page.getByText("Added to Mon Dinner")).toBeVisible();

    // --- Generate the shopping list for that week -------------------------
    await page.goto("/meal-plan");
    // The slot chip's inner span is a zero-width `truncate` element in the
    // desktop layout; assert on the chip button's accessible name instead.
    await expect(
      page.getByRole("button", { name: `${RECIPE_TITLE} for dinner on Mon` }),
    ).toBeVisible();
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

    // Deleting the source recipe must remove both checked and unchecked groceries.
    const fixtureItems = page.getByRole("checkbox", { name: /e2e-(spaghetti|tomato sauce)/ });
    await expect(fixtureItems).toHaveCount(2);

    // --- Delete the recipe and verify its derived state disappears --------
    await page.goto("/recipes");
    await page.getByText(RECIPE_TITLE).first().click();
    await page.getByRole("button", { name: /delete/i }).first().click();
    const confirm = page.getByRole("button", { name: /^delete/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
    await expect(page).toHaveURL(/\/recipes$/);
    await page.goto("/shopping-list");
    await expect(fixtureItems).toHaveCount(0);
    await page.goto("/meal-plan");
    await expect(page.getByRole("button", { name: `${RECIPE_TITLE} for dinner on Mon` })).toHaveCount(0);

    if (!originallyReviewed) {
      await page.goto("/profile");
      const preference = page.getByRole("checkbox", { name: "Review recipes before saving" });
      await expect(preference).toBeEnabled();
      await preference.click();
      await expect(preference).not.toBeChecked();
      await expect(preference).toBeEnabled();
    }
  });
});
