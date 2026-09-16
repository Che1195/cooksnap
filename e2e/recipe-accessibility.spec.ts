/** Keyboard completion at 320 CSS px and real Chromium browser zoom of 200%. */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.skip(!process.env.E2E_CLERK_USER_EMAIL, "Requires a disposable Clerk development account");

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let n = 0; n < 70; n++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function expectFocusedControlVisible(target: Locator) {
  await expect(target).toBeFocused();
  const visible = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.top >= 0 && box.bottom <= innerHeight && !!hit && (hit === element || element.contains(hit));
  });
  expect(visible, "Focused control must be visible and unobscured").toBe(true);
}
for (const scenario of [{ name: "320px reflow", width: 320, zoom: 1 }, { name: "200% browser zoom", width: 1280, zoom: 2 }]) {
  test(`${scenario.name}: keyboard import, correction, save, and cancellation`, async ({}, testInfo) => {
    test.setTimeout(90_000);
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const extensionPath = path.resolve("e2e/fixtures/zoom-extension");
    const profile = await mkdtemp(path.join(tmpdir(), "cooksnap-zoom-"));
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: true, viewport: { width: scenario.width, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try {
      const storage: { cookies: Parameters<typeof context.addCookies>[0] } = JSON.parse(await readFile("playwright/.clerk/user.json", "utf8"));
      await context.addCookies(storage.cookies);
      const page = await context.newPage();
      await page.goto(baseURL);
      await expect(page.getByLabel("Recipe URL")).toBeVisible();
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
      const zoom = await worker.evaluate(async ({ origin, factor }) => {
        const tabs = (globalThis as unknown as { chrome: { tabs: {
          query(options: { url: string }): Promise<{ id?: number }[]>;
          setZoom(id: number, factor: number): Promise<void>;
          getZoom(id: number): Promise<number>;
        } } }).chrome.tabs;
        const tab = (await tabs.query({ url: `${origin}/*` }))[0];
        if (tab?.id === undefined) throw new Error("Test tab unavailable");
        await tabs.setZoom(tab.id, factor);
        return tabs.getZoom(tab.id);
      }, { origin: baseURL, factor: scenario.zoom });
      expect(zoom).toBe(scenario.zoom);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(scenario.width / scenario.zoom);
      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(viewport).not.toMatch(/maximum-scale=1(?:,|$)|user-scalable=no/);
      const token = randomUUID();
      const title = `E2E Keyboard ${token}`;
      await page.route("**/api/scrape", (route) => {
        const body = route.request().postDataJSON() as { importId: string };
        return route.fulfill({ json: {
          title, image: null, ingredients: ["1 cup flour"], instructions: ["Stir the flour."], servings: "2",
          warnings: ["Check the ingredient amount."], needsReview: true, importId: body.importId,
        } });
      });
      const input = page.getByLabel("Recipe URL");
      await tabTo(page, input);
      await page.keyboard.type(`https://example.com/${token}`);
      await tabTo(page, page.getByRole("button", { name: "Snap recipe" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Review recipe" })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const titleInput = page.getByLabel("Title", { exact: true });
      await tabTo(page, titleInput);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      const save = page.getByRole("button", { name: "Save recipe", exact: true });
      await tabTo(page, save);
      await expectFocusedControlVisible(save);
      // Capture the native zoomed viewport without Playwright's screenshot
      // viewport overrides, which can crop Chromium tabs at non-default zoom.
      const cdp = await context.newCDPSession(page);
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(testInfo.outputPath("keyboard-save.png"), Buffer.from(screenshot.data, "base64"));
      await cdp.detach();
      await page.keyboard.press("Enter");
      await expect(titleInput).toBeFocused();
      await expect(titleInput).toHaveAttribute("aria-invalid", "true");
      await page.keyboard.type(title);
      const ingredient = page.getByLabel("Ingredient 1", { exact: true });
      await tabTo(page, ingredient);
      await expectFocusedControlVisible(ingredient);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("2 cups flour");
      await tabTo(page, save);
      await page.keyboard.press("Enter");
      await expect(page.getByText(`"${title}" saved!`)).toBeVisible();
      await page.goto(`${baseURL}/recipes`);
      await page.getByLabel("Search recipes").fill(title);
      await expect(page.getByRole("link", { name: `View recipe: ${title}` })).toBeVisible();
      // The saved recipe is removed by the temporary account's final purge.
      await page.goto(baseURL);
      await tabTo(page, input);
      await page.keyboard.type(`https://example.com/cancel-${token}`);
      await tabTo(page, page.getByRole("button", { name: "Snap recipe" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Review recipe" })).toBeFocused();
      await tabTo(page, page.getByRole("button", { name: "Cancel", exact: true }));
      await page.keyboard.press("Enter");
      await expect(input).toBeFocused();
      await testInfo.attach("zoom-evidence", { body: JSON.stringify({ zoom, layoutWidth: await page.evaluate(() => innerWidth), viewportWidth: scenario.width }), contentType: "application/json" });
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
