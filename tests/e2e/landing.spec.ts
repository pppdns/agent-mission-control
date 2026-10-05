import { expect, test } from "@playwright/test";

// Under E2E_FIXTURES the featured runs are the two recorded fixtures: fixture-loop, then fixture-hitl.

test("the reel plays featured runs and rotates without interaction", async ({ page }) => {
  await page.goto("/");
  const reel = page.getByLabel("Featured runs, playing automatically");
  // The reel only plays while it is on screen; on a phone it sits below the prompt.
  await reel.scrollIntoViewIfNeeded();
  await expect(reel).toBeVisible();

  const segments = reel.getByRole("group", { name: "Choose a featured run" }).getByRole("button");
  await expect(segments).toHaveCount(2);
  await expect(segments.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(reel.getByRole("link", { name: /Open the full replay/ })).toHaveAttribute("href", "/run/fixture-loop?play=1");
  await expect(reel.getByText(/Orchestrator assembles a team of \d+/)).toBeVisible();

  await expect(segments.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await expect(reel.getByRole("link", { name: /Open the full replay/ })).toHaveAttribute("href", "/run/fixture-hitl?play=1");
  await expect(reel.getByText("Visitor")).toBeVisible({ timeout: 8_000 });

  await segments.nth(0).click();
  await expect(segments.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(reel.getByRole("link", { name: /Open the full replay/ })).toHaveAttribute("href", "/run/fixture-loop?play=1");
});

test("team cards link to full replays", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByRole("list", { name: "Featured runs" });
  await expect(cards.getByRole("link")).toHaveCount(2);
  await expect(cards.getByRole("link").first()).toHaveAttribute("href", "/run/fixture-loop?play=1");
  await expect(cards.getByRole("list", { name: "Team" }).first().getByRole("listitem").first()).toBeVisible();
  await cards.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/run\/fixture-loop\?play=1$/);
});

test("phone layout: no sideways page scroll, swipeable cards", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/");
  await expect(page.getByLabel("Featured runs, playing automatically")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  const row = page.getByRole("list", { name: "Featured runs" });
  await row.scrollIntoViewIfNeeded();
  const { scrollWidth, clientWidth } = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});
