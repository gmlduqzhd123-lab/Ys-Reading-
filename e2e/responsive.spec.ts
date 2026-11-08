import { test, expect } from "./checked-test";
for (const path of [
  "/",
  "/login",
  "/guide",
  "/privacy",
  "/status",
  "/device-check",
])
  test("mobile WebKit " + path, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
    await expect(
      page.getByRole("link", { name: "책숲 BOOKFOREST · 홈" }),
    ).toBeVisible();
  });
