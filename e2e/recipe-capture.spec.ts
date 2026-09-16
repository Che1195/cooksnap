/**
 * Mock only capture; Clerk authentication and Convex saves remain real.
 * Requires E2E_CLERK_USER_EMAIL for a disposable development account.
 * Run this file alone: preferences are account-wide. The projection case
 * requires an empty shopping list and removes only its own fixture items.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  buildSemanticInterpretation,
  incompleteMeasurementWarnings,
  validateInterpretation,
} from "../src/lib/recipe-interpretation";
import type { ScrapedRecipe } from "../src/types";

const preferenceName = "Review recipes before saving";

async function setReview(page: Page, checked: boolean) {
  await page.goto("/profile");
  const preference = page.getByRole("checkbox", { name: preferenceName });
  await expect(preference).toBeEnabled();
  // This controlled checkbox updates after the Convex mutation resolves.
  // setChecked asserts synchronously after clicking and races that update.
  if ((await preference.isChecked()) !== checked) await preference.click();
  await expect(preference).toBeChecked({ checked });
  await expect(preference).toBeEnabled();
  await page.reload();
  await expect(preference).toBeChecked({ checked });
}

async function originalReview(page: Page) {
  await page.goto("/profile");
  const preference = page.getByRole("checkbox", { name: preferenceName });
  await expect(preference).toBeEnabled();
  return preference.isChecked();
}

async function capture(page: Page, token: string) {
  await page.goto("/");
  await page.getByLabel("Recipe URL").fill(`https://example.com/${token}`);
  await page.getByRole("button", { name: "Snap recipe" }).click();
  await expect(page.getByRole("heading", { name: "Review recipe" })).toBeVisible();
}

async function findRecipe(page: Page, title: string) {
  await page.goto("/recipes");
  // Search renders after loading; New Group is enabled only while connected.
  // Absence checks must not pass against an empty/loading or offline snapshot.
  await expect(page.getByLabel("Search recipes")).toBeVisible();
  await expect(page.getByRole("button", { name: "New Group", exact: true })).toBeEnabled();
  const search = page.getByLabel("Search recipes");
  await search.fill(title);
  await expect(search).toHaveValue(title);
  return page.getByRole("heading", { name: title, exact: true });
}

async function removeRecipe(page: Page, title: string) {
  const recipe = await findRecipe(page, title);
  if (!(await recipe.count())) return;
  await openRecipeDetail(page, title);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(await findRecipe(page, title)).toHaveCount(0);
}

async function openRecipeDetail(page: Page, title: string) {
  await page.getByRole("link", { name: `View recipe: ${title}`, exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
}

function recipeFixture(title: string, ingredient: string): ScrapedRecipe {
  return {
    title,
    image: null,
    ingredients: [`1 cup ${ingredient}`],
    instructions: [`Add 1 cup ${ingredient}.`],
    prepTime: null,
    cookTime: null,
    totalTime: null,
    servings: "2",
    author: null,
    cuisineType: null,
  };
}

test.describe("recipe capture", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!process.env.E2E_CLERK_USER_EMAIL, "Set E2E_CLERK_USER_EMAIL to a disposable Clerk development user");

  test("review preference persists; flagged capture requires review, cancels, and saves edits", async ({ page }) => {
    const token = randomUUID();
    const title = `E2E Review ${token}`;
    const fixture = recipeFixture(title, `e2e-flour-${token}`);
    const originallyReviewed = await originalReview(page);
    let needsReview = false;
    await page.route("**/api/scrape", (route) => {
      const body = route.request().postDataJSON() as { importId: string };
      return route.fulfill({ json: {
        ...fixture, importId: body.importId, needsReview,
        warnings: needsReview ? ["Check the imported ingredient amount."] : [],
      } });
    });
    try {
      await setReview(page, true);
      await capture(page, token);
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      await setReview(page, false);
      needsReview = true;
      await capture(page, token);
      await expect(page.getByText("Check the flagged details before saving.")).toBeVisible();
      await expect(page.getByText("Check the imported ingredient amount.")).toBeVisible();
      // A second page checks real persisted state while the draft stays open.
      const observer = await page.context().newPage();
      try {
        await expect(await findRecipe(observer, title)).toHaveCount(0);
      } finally {
        await observer.close();
      }
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByLabel("Recipe URL")).toBeFocused();
      await expect(await findRecipe(page, title)).toHaveCount(0);

      await capture(page, token);
      const editedIngredient = `2 cups e2e-flour-${token}`;
      await page.getByLabel("Ingredient 1", { exact: true }).fill(editedIngredient);
      await page.getByRole("button", { name: "Save recipe", exact: true }).click();
      await expect(page.getByText(`"${title}" saved!`)).toBeVisible();
      await findRecipe(page, title);
      await openRecipeDetail(page, title);
      await page.reload();
      await expect(page.getByText(editedIngredient, { exact: true })).toBeVisible();
    } finally {
      try { await removeRecipe(page, title); }
      finally { await setReview(page, originallyReviewed); }
    }
  });

  test("unchanged interpretation scales detail, cooking, and shopping amounts across reload", async ({ page }) => {
    const token = randomUUID();
    const title = `E2E Projection ${token}`;
    // Alphabetic identity avoids introducing fake measured quantities in a name.
    const marker = token.replaceAll("-", "").replace(/\d/g, (digit) => String.fromCharCode(107 + Number(digit)));
    const ingredient = `dry lentils ${marker}`;
    const fixture = recipeFixture(title, ingredient);
    fixture.ingredients = [`1.5 cups ${ingredient} (275g, about half a bag)`];
    fixture.instructions = [`Add 1.5 cups ${ingredient}.`];
    fixture.interpretation = buildSemanticInterpretation(fixture, {
      ingredients: [{ index: 0, name: ingredient }],
      references: [{ step: 0, ingredient: 0, text: ingredient }],
    });
    expect(fixture.interpretation).toBeDefined();
    expect(validateInterpretation(fixture, fixture.interpretation)).toBeDefined();
    const warnings = incompleteMeasurementWarnings(fixture, fixture.interpretation);
    expect(warnings).toHaveLength(1);
    const originallyReviewed = await originalReview(page);
    let shoppingAttempted = false;
    await page.route("**/api/scrape", (route) => {
      const body = route.request().postDataJSON() as { importId: string };
      return route.fulfill({ json: { ...fixture, importId: body.importId, warnings, needsReview: true } });
    });
    try {
      await page.goto("/shopping-list");
      await expect(page.getByRole("heading", { name: "No items yet", exact: true })).toBeVisible();
      await setReview(page, true);
      await capture(page, token);
      await page.getByRole("button", { name: "Save recipe", exact: true }).click();
      await expect(page.getByText(`"${title}" saved!`)).toBeVisible();
      await findRecipe(page, title);
      await openRecipeDetail(page, title);
      await page.reload();
      await expect(page.getByText(fixture.ingredients[0], { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Increase servings" }).click();
      await page.getByRole("button", { name: "Increase servings" }).click();
      const scaledIngredient = `3 cups ${ingredient} (275g, about half a bag)`;
      const scaledInstruction = `Add 3 cups ${ingredient}.`;
      await expect(page.getByText("4 servings", { exact: true })).toBeVisible();
      await expect(page.getByText(scaledIngredient, { exact: true })).toBeVisible();
      await expect(page.getByText(scaledInstruction, { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: warnings[0] })).toBeVisible();
      await page.getByRole("button", { name: "Cook", exact: true }).click();
      await expect(page).toHaveURL(/\/cook$/);
      await page.reload();
      await expect(page.getByText("4 servings", { exact: true })).toBeVisible();
      await expect(page.getByText(scaledIngredient, { exact: true })).toBeVisible();
      await expect(page.getByText(scaledInstruction, { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: warnings[0] })).toBeVisible();
      shoppingAttempted = true;
      await page.getByRole("button", { name: "Add to list", exact: true }).click();
      await expect(page.getByText("Ingredients added to shopping list")).toBeVisible();
      await page.getByRole("button", { name: "Reset amounts", exact: true }).click();
      await expect(page.getByText("2 servings", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("2 servings", { exact: true })).toBeVisible();
      await expect(page.getByText(fixture.ingredients[0], { exact: true })).toBeVisible();
      await expect(page.getByText(fixture.instructions[0], { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: warnings[0] })).toHaveCount(0);
      await page.goto("/shopping-list");
      await page.reload();
      await expect(page.getByRole("checkbox", { name: `3 cups ${ingredient}, 275g, about half a bag`, exact: true })).toBeVisible();
    } finally {
      try {
        if (shoppingAttempted) {
          await page.goto("/shopping-list");
          await expect(page.getByRole("button", { name: "Generate from this week's meal plan", exact: true })).toBeEnabled();
          const items = page.getByRole("checkbox");
          // Bulk removal is safe only when every present row belongs to this run.
          const names = await items.evaluateAll((nodes) => nodes.map((node) => document.querySelector(`label[for="${node.id}"]`)?.textContent ?? ""));
          expect(names.every((name) => name.includes(marker))).toBe(true);
          for (const item of await items.all()) await item.check();
          if (names.length) {
            await page.getByRole("button", { name: `Clear (${names.length})`, exact: true }).click();
            await expect(page.getByRole("heading", { name: "No items yet", exact: true })).toBeVisible();
          }
        }
      } finally {
        try { await removeRecipe(page, title); }
        finally { await setReview(page, originallyReviewed); }
      }
    }
  });

  test("review opt-out syncs to a fresh context and a clean capture saves automatically", async ({ page, browser }) => {
    const token = randomUUID();
    const title = `E2E Automatic ${token}`;
    const fixture = recipeFixture(title, "flour");
    const originallyReviewed = await originalReview(page);
    // Separate cookies/local storage copy, with no shared React or Convex client.
    const otherContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      storageState: await page.context().storageState(),
    });
    try {
      await setReview(page, false);
      const otherPage = await otherContext.newPage();
      await otherPage.goto("/profile");
      const preference = otherPage.getByRole("checkbox", { name: preferenceName });
      await expect(preference).toBeEnabled();
      await expect(preference).not.toBeChecked();
      await otherPage.route("**/api/scrape", (route) => {
        const body = route.request().postDataJSON() as { importId: string };
        return route.fulfill({ json: { ...fixture, importId: body.importId, warnings: [], needsReview: false } });
      });
      await otherPage.goto("/");
      await otherPage.getByLabel("Recipe URL").fill(`https://example.com/${token}`);
      await otherPage.getByRole("button", { name: "Snap recipe" }).click();
      await expect(otherPage.getByText(`"${title}" saved!`)).toBeVisible();
      await expect(otherPage.getByRole("heading", { name: "Review recipe" })).toHaveCount(0);
      await expect(await findRecipe(page, title)).toBeVisible();
      await openRecipeDetail(page, title);
      await expect(page.getByText(fixture.ingredients[0], { exact: true })).toBeVisible();
    } finally {
      await otherContext.close();
      try { await removeRecipe(page, title); }
      finally { await setReview(page, originallyReviewed); }
    }
  });
});
