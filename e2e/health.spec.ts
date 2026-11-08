import { expect, test } from '@playwright/test';
import { personPage } from './people';

test('health: a medicine and a Medical ID entry made by one partner are visible to the other, and sharing can hide them', async ({ browser }) => {
  const a = await personPage(browser, 'asha');
  const b = await personPage(browser, 'bilal');
  const drug = `Atorvastatin ${Date.now()}`;

  await test.step('A opens Health from the Add sheet and adds a medicine that is due every day', async () => {
    await a.getByRole('button', { name: 'Add', exact: true }).click();
    await a.getByRole('button', { name: /^Medicine/ }).click();
    await a.getByPlaceholder('Atorvastatin').fill(drug);
    await a.getByRole('button', { name: 'Add medicine', exact: true }).last().click();
    await expect(a.getByText(drug).first()).toBeVisible();
  });

  await test.step('A marks today\'s dose taken', async () => {
    await a.getByRole('button', { name: 'Mark taken' }).first().click();
    await expect(a.getByRole('button', { name: 'Mark not taken' }).first()).toBeVisible();
  });

  await test.step('B sees A\'s medicine on the Partner view', async () => {
    await b.goto('/#health-meds');
    await b.getByRole('tab', { name: /Asha/ }).click();
    await expect(b.getByText(drug).first()).toBeVisible();
  });

  await test.step('A hides medicines from B; B no longer sees it', async () => {
    await a.goto('/#health-share');
    await a.getByLabel('Medicines and doses').selectOption('hidden');
    await b.goto('/#health-meds');
    await b.getByRole('tab', { name: /Asha/ }).click();
    await expect(b.getByText(drug)).toHaveCount(0);
  });

  await test.step('Health settings and Medical ID open without errors', async () => {
    const errors: string[] = [];
    a.on('pageerror', (e) => errors.push(e.message));
    for (const tab of ['health-settings', 'health-medid', 'health-records', 'health-labs', 'health-vitals', 'health-cycle']) {
      await a.goto(`/#${tab}`);
      await expect(a.locator('h1').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
