import { expect, test, type Browser, type Page } from '@playwright/test';
import { ALLOWED_EMAILS } from '../convex/allowedEmails';

/**
 * Full stack, two real people: browser → React → Convex client → local Convex
 * backend → database → live subscription → the *other* person's browser.
 */

test.describe.configure({ mode: 'serial' });

const PASSWORD = 'e2e-password-123';

async function signUp(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'First time? Create an account' }).click();
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
}

/** First-run onboarding: "One Last Thing — what should we call you?" */
async function chooseName(page: Page, name: string) {
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByPlaceholder('Your name')).toBeHidden();
}

async function personPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test('a stranger cannot create an account', async ({ page }) => {
  await signUp(page, 'intruder@example.com');
  await expect(page.getByText(/This app is private/)).toBeVisible();
});

test('both partners sign up, split a bill, settle it and chat in real time', async ({ browser }) => {
  const a = await personPage(browser);
  const b = await personPage(browser);

  await signUp(a, ALLOWED_EMAILS[0]);
  await chooseName(a, 'Asha');
  await signUp(b, ALLOWED_EMAILS[1]);
  await chooseName(b, 'Bilal');

  await test.step('A adds an expense; both see the same debt', async () => {
    await a.goto('/#split');
    await a.getByRole('button', { name: 'Add expense' }).first().click();
    await a.getByPlaceholder('0.00').fill('1200');
    await a.getByRole('button', { name: 'Food', exact: true }).click();

    const started = Date.now();
    await a.getByRole('button', { name: 'Add expense', exact: true }).last().click();
    await expect(a.getByText(/Bilal owes you \D*600\.00/)).toBeVisible();
    // Perf: tap → server round-trip → re-render. "Nothing happens for 5s" is a bug.
    expect(Date.now() - started, 'add-expense round trip (ms)').toBeLessThan(3_000);

    await b.goto('/#split');
    await expect(b.getByText(/You owe Asha \D*600\.00/)).toBeVisible();
  });

  await test.step('B settles up; A sees it clear without reloading', async () => {
    await b.getByRole('button', { name: 'Settle', exact: true }).click();
    await expect(b.getByText('All settled up')).toBeVisible();
    await expect(a.getByText('All settled up')).toBeVisible();
    await expect(a.getByText('Settlement history')).toBeVisible();
  });

  await test.step('A sends a chat message; B receives it live', async () => {
    await a.goto('/#chat');
    await b.goto('/#chat');
    const text = `hello from e2e ${Date.now()}`;
    await a.getByPlaceholder('Message…').fill(text);
    await a.getByRole('button', { name: 'Send message' }).click();
    await expect(b.getByText(text)).toBeVisible();
  });
});
