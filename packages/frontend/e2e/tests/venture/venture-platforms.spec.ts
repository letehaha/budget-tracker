import { expect, test } from '@playwright/test';

import { completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';
import { waitForSuccessToast } from '../../helpers/ui';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'vp' });

let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Venture Platforms — CRUD', () => {
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

  test('Venture landing page shows empty deals state and links to platforms', async ({ page }) => {
    await page.goto('/venture');
    await page.waitForURL(/\/venture$/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: /^venture$/i, level: 1 })).toBeVisible();
    // Empty state when user has no deals yet
    await expect(page.getByRole('heading', { name: /no venture deals yet/i, level: 3 })).toBeVisible();

    const managePlatformsBtn = page.getByRole('link', { name: /manage platforms/i });
    await expect(managePlatformsBtn).toBeVisible();
    await managePlatformsBtn.click();

    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /venture platforms/i, level: 1 })).toBeVisible();
  });

  test('Empty state shows when user has no platforms, opens create dialog', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: /no platforms yet/i, level: 3 })).toBeVisible({ timeout: 10_000 });

    const emptyStateBtn = page.getByRole('button', { name: /add platform/i }).last();
    await emptyStateBtn.click();

    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Create platform "Acme Ventures" with all fields and defaults', async ({ page }) => {
    // Capture any API errors so failures are easier to diagnose
    page.on('response', (response) => {
      if (response.url().includes('/venture/platforms') && !response.ok()) {
        console.error(`[API ERROR] ${response.request().method()} ${response.url()} → ${response.status()}`);
      }
    });

    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    const addBtn = page.getByRole('button', { name: /add platform/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Name + website + description
    const inputs = dialog.locator('input');
    await inputs.nth(0).fill('Acme Ventures');
    await inputs.nth(1).fill('https://acme.example');
    await dialog.locator('textarea').fill('SK 116 YC W26 syndicate');

    // Fees — pct fields are inputs[2]..[5] (entry / mgmt / carry / hurdle).
    // Form uses percent values (UI), API converts to decimal.
    await inputs.nth(2).fill('8.5'); // entry fee
    await inputs.nth(3).fill('0'); // mgmt
    await inputs.nth(4).fill('20'); // carry
    await inputs.nth(5).fill('0'); // hurdle

    // Wait for the POST and click in lockstep so we don't race the mutation
    const createResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/venture/platforms') && response.request().method() === 'POST',
    );

    await dialog.getByRole('button', { name: /^create$/i }).click();

    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(200);

    await waitForSuccessToast({ page });

    // Card surfaces in the grid
    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('SK 116 YC W26 syndicate')).toBeVisible();
    await expect(page.getByText('8.5%', { exact: true })).toBeVisible();
    await expect(page.getByText('20%', { exact: true })).toBeVisible();
  });

  test('Submit button disabled when name is empty', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible({ timeout: 10_000 });

    const addBtn = page.getByRole('button', { name: /add platform/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // No name entered — submit must be disabled
    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    // Close dialog (don't pollute next test)
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('Reject duplicate platform name', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible({ timeout: 10_000 });

    const addBtn = page.getByRole('button', { name: /add platform/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').nth(0).fill('Acme Ventures');
    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Backend returns ConflictError → notification center shows error toast
    await expect(page.locator('[data-sonner-toast][data-type="error"], .bg-destructive').first()).toBeVisible({
      timeout: 10_000,
    });

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('Edit platform — change carry and verify update', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible({ timeout: 10_000 });

    // Card is the closest container with the Tailwind `bg-card` class.
    const card = page.locator('.bg-card').filter({ hasText: 'Acme Ventures' }).first();
    await card.getByRole('button', { name: /edit/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Change carry % (input at index 4)
    const carryInput = dialog.locator('input').nth(4);
    await carryInput.fill('25');

    const submitBtn = dialog.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await waitForSuccessToast({ page });

    await expect(page.getByText('25%', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Create second platform and verify both show in list', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible({ timeout: 10_000 });

    const addBtn = page.getByRole('button', { name: /add platform/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').nth(0).fill('AngelList Syndicates');
    await dialog.locator('input').nth(4).fill('15'); // carry

    await dialog.locator('button[type="submit"]').click();

    await waitForSuccessToast({ page });

    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AngelList Syndicates' })).toBeVisible({ timeout: 10_000 });
  });

  test('Delete platform — confirmation dialog removes from list', async ({ page }) => {
    await page.goto('/venture/platforms');
    await page.waitForURL(/\/venture\/platforms/, { timeout: 15_000 });

    await expect(page.getByRole('heading', { name: 'AngelList Syndicates' })).toBeVisible({ timeout: 10_000 });

    const card = page.locator('.bg-card').filter({ hasText: 'AngelList Syndicates' }).first();
    await card.getByRole('button', { name: /delete/i }).click();

    // ResponsiveAlertDialog — destructive confirm
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 10_000 });
    await expect(alertDialog.getByText(/AngelList Syndicates/i)).toBeVisible();

    await alertDialog.getByRole('button', { name: /^delete$/i }).click();

    await waitForSuccessToast({ page });

    // Gone from list — but Acme Ventures stays
    await expect(page.getByRole('heading', { name: 'AngelList Syndicates' })).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Acme Ventures' })).toBeVisible();
  });

  test('Sidebar link routes from anywhere to /venture', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Sidebar has an "Accounts" collapsible parent containing "Venture" leaf.
    // Open the collapsible if not already.
    const ventureLink = page.getByRole('link', { name: /^venture$/i }).first();
    if (!(await ventureLink.isVisible())) {
      const accountsCollapsibleTrigger = page
        .getByRole('button')
        .filter({ hasText: /^accounts$/i })
        .first();
      await accountsCollapsibleTrigger.click();
    }

    await expect(ventureLink).toBeVisible({ timeout: 10_000 });
    await ventureLink.click();

    await page.waitForURL(/\/venture(\/|$)/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^venture$/i, level: 1 })).toBeVisible();
  });
});
