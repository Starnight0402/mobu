import { expect, test } from '@playwright/test';
import { PEOPLE, personPage, submitSignUp } from './people';

/**
 * Full stack, two real people: browser → React → Convex client → local Convex
 * backend → database → live subscription → the *other* person's browser.
 */

test('a stranger cannot create an account', async ({ page }) => {
  await submitSignUp(page, 'intruder@example.com');
  await expect(page.getByText(/This app is private/)).toBeVisible();
});

test("signing up again with someone's email and the wrong password is refused", async ({ browser, page }) => {
  await personPage(browser, 'asha'); // make sure the account exists
  await page.goto('/');
  await page.getByRole('button', { name: 'First time? Create an account' }).click();
  await page.getByPlaceholder('you@example.com').fill(PEOPLE.asha.email);
  await page.getByPlaceholder('••••••••').fill('attacker-guess-123');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible(); // still signed out
});

test('both partners split a bill, settle it and chat in real time', async ({ browser }) => {
  const a = await personPage(browser, 'asha');
  const b = await personPage(browser, 'bilal');

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
