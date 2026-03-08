import { test, expect } from '@playwright/test';

import { completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';
import { waitForSuccessToast } from '../../helpers/ui';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'pc' });

let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Portfolio Creation', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });

    if (!dataSeeded) {
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });
      await page.goto('/dashboard');
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
      dataSeeded = true;
    }
  });

  test('create portfolio from empty state', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForURL(/\/investments/, { timeout: 15_000 });

    const emptyStateBtn = page.getByRole('button', { name: /create your first portfolio/i });
    await expect(emptyStateBtn).toBeVisible({ timeout: 10_000 });
    await emptyStateBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('My First Portfolio');

    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await waitForSuccessToast({ page });

    await expect(page.locator('a').filter({ hasText: 'My First Portfolio' })).toBeVisible({ timeout: 10_000 });
  });

  test('create second portfolio with type and description', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForURL(/\/investments/, { timeout: 15_000 });

    await expect(page.locator('a').filter({ hasText: 'My First Portfolio' })).toBeVisible({ timeout: 10_000 });

    const createBtn = page
      .getByRole('button')
      .filter({ hasText: /create/i })
      .first();
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('Retirement Fund');

    const typeSelect = dialog.locator('button[role="combobox"]').first();
    await typeSelect.click();
    await page.getByRole('option', { name: /retirement/i }).click();

    await dialog.locator('textarea').fill('Long-term retirement savings');

    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await waitForSuccessToast({ page });

    await expect(page.locator('a').filter({ hasText: 'My First Portfolio' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a').filter({ hasText: 'Retirement Fund' })).toBeVisible({ timeout: 10_000 });
  });

  test('submit button is disabled when name is empty', async ({ page }) => {
    await page.goto('/investments');
    await page.waitForURL(/\/investments/, { timeout: 15_000 });

    await expect(page.locator('a').filter({ hasText: 'My First Portfolio' })).toBeVisible({ timeout: 10_000 });

    const createBtn = page
      .getByRole('button')
      .filter({ hasText: /create/i })
      .first();
    await createBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
  });
});
