import { expect, test } from "@playwright/test";

const marker = `Automated feedback verification ${Date.now()}`;

test.describe("feedback", () => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL, "Requires a disposable Clerk development account");

  test("mobile feedback supports keyboard access, both categories, and persisted receipts", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/recipes?private=omit#omit");
    const trigger = page.getByRole("button", { name: "Feedback", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Send feedback" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByLabel("Description", { exact: true }).fill(`${marker}: issue`);
    await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(dialog.getByText("Issue report saved to CookSnap.")).toBeVisible();
    await dialog.getByRole("radio", { name: "Request a feature" }).check();
    await dialog.getByLabel("Description", { exact: true }).fill(`${marker}: feature`);
    await dialog.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(dialog.getByText("Feature request saved to CookSnap.")).toBeVisible();
    await page.screenshot({ path: "test-results/feedback-verification/mobile-receipt.png", fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("link", { name: "View feedback and status" }).click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText(`${marker}: issue`, { exact: true }).last()).toBeVisible();
    await expect(page.getByText(`${marker}: feature`, { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: "test-results/feedback-verification/mobile-inbox.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 320, height: 740 });
    for (const route of ["/", "/recipes", "/meal-plan", "/shopping-list", "/cook", "/profile", "/issues"]) {
      await page.goto(route);
      await expect(page.getByRole("button", { name: "Feedback", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    }
    await page.screenshot({ path: "test-results/feedback-verification/narrow-inbox.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await trigger.click();
    await page.screenshot({ path: "test-results/feedback-verification/desktop-form.png", fullPage: true, animations: "disabled" });
  });
});
