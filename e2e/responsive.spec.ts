import { test, expect } from "./checked-test";
import AxeBuilder from "@axe-core/playwright";
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

test("home actions and mission controls are readable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const entry = page.locator(".paper-home-intro");
  for (const label of ["학생 입장", "교사 시작", "독서미션 둘러보기"])
    await expect(entry.getByRole("link", { name: label, exact: true })).toBeVisible();
  const grade = page.getByRole("combobox", { name: "학년 선택", exact: true });
  await expect(grade).toHaveCSS("font-size", "16px");
  expect((await grade.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(axe.violations.map(issue => issue.nodes.map(node => node.target))).toEqual([]);
});
