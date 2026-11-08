import { expect, type Browser, type Page } from '@playwright/test';
import { ALLOWED_EMAILS } from '../convex/allowedEmails';

export const PASSWORD = 'e2e-password-123';

export const PEOPLE = {
  asha: { email: ALLOWED_EMAILS[0], name: 'Asha' },
  bilal: { email: ALLOWED_EMAILS[1], name: 'Bilal' },
} as const;

export async function submitSignUp(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'First time? Create an account' }).click();
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
}

/**
 * A signed-in page for one of the two people, whatever state the shared
 * backend is in, so each spec file runs on its own or in any order. The first
 * sign-up lands on onboarding; signing up again with the *same* password just
 * signs in (Convex Auth verifies it; a wrong one is refused -- see couple.spec).
 */
export async function personPage(browser: Browser, who: keyof typeof PEOPLE): Promise<Page> {
  const { email, name } = PEOPLE[who];
  const page = await (await browser.newContext()).newPage();

  await submitSignUp(page, email);
  const nameBox = page.getByPlaceholder('Your name');
  const appShell = page.getByRole('button', { name: 'Add', exact: true });
  await nameBox.or(appShell).first().waitFor();
  if (await nameBox.isVisible()) {
    await nameBox.fill(name);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(appShell).toBeVisible();
  return page;
}
