import { expect, test } from '@playwright/test';

/**
 * Cold-load budget on a mid-range phone profile: from navigation to an
 * interactive sign-in form. Tighten these as the bundle is split up.
 */
const BUDGET = {
  domContentLoadedMs: 2_500,
  signInInteractiveMs: 4_000,
};

test('cold load reaches an interactive sign-in form within budget', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByPlaceholder('you@example.com')).toBeEditable();
  const interactive = Date.now() - started;

  const dcl = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return nav.domContentLoadedEventEnd - nav.startTime;
  });

  console.log(`perf: DOMContentLoaded ${Math.round(dcl)}ms, sign-in interactive ${interactive}ms`);
  expect(dcl).toBeLessThan(BUDGET.domContentLoadedMs);
  expect(interactive).toBeLessThan(BUDGET.signInInteractiveMs);
});

test('the app boots without uncaught errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  expect(errors).toEqual([]);
});
