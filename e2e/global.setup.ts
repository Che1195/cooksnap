import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "path";

setup.describe.configure({ mode: "serial" });

const authFile = path.join(__dirname, "../playwright/.clerk/user.json");

setup("clerk testing token", async () => {
  if (process.env.E2E_CLERK_USER_EMAIL) {
    process.env.CLERK_PUBLISHABLE_KEY ??=
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    await clerkSetup();
  }
});

if (process.env.E2E_CLERK_USER_EMAIL) {
  setup("sign in test user", async ({ page }) => {
    await page.goto("/login");
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    await page.goto("/");
    await page.getByLabel("Recipe URL").waitFor();
    await page.context().storageState({ path: authFile });
  });
} else {
  setup("write empty storage state", async () => {
    await mkdir(path.dirname(authFile), { recursive: true });
    await writeFile(authFile, JSON.stringify({ cookies: [], origins: [] }));
  });
}
