import { test, expect } from '@playwright/test';

import { completeOnboarding, createAccount } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'es-excl' });

let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Expenses Structure – Exclude Categories', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });

    if (!dataSeeded) {
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });
      await createAccount({
        request: page.request,
        name: 'Test Account',
        currencyCode: CURRENCY,
        initialBalance: 1000,
      });
      dataSeeded = true;
    }

    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('opens exclude categories dialog from settings popover', async ({ page }) => {
    const widget = page.getByTestId('widget-expenses-structure');
    await expect(widget).toBeVisible({ timeout: 10_000 });

    // Click the settings gear icon
    await widget.getByTestId('es-settings-btn').click();

    // Popover should open with "Exclude categories" item
    const excludeBtn = page.getByTestId('es-exclude-categories-btn');
    await expect(excludeBtn).toBeVisible({ timeout: 5_000 });

    // Click the "Exclude categories" item
    await excludeBtn.click();

    // Dialog should open and popover should close
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(excludeBtn).not.toBeVisible();
  });

  test('search filters categories in the dialog', async ({ page }) => {
    const widget = page.getByTestId('widget-expenses-structure');
    await expect(widget).toBeVisible({ timeout: 10_000 });

    // Open the dialog
    await widget.getByTestId('es-settings-btn').click();
    await page.getByTestId('es-exclude-categories-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Count initial categories
    const allLabels = dialog.locator('label');
    const initialCount = await allLabels.count();
    expect(initialCount).toBeGreaterThan(0);

    // Search for "Food"
    const searchInput = dialog.locator('input[type="text"]');
    await searchInput.fill('Food');

    // Should have fewer categories
    const filteredCount = await allLabels.count();
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Clear search
    await page.getByTestId('es-search-clear').click();
    const restoredCount = await allLabels.count();
    expect(restoredCount).toBe(initialCount);
  });

  test('select a category, save, dialog closes, and warning popover shows it', async ({ page }) => {
    const widget = page.getByTestId('widget-expenses-structure');
    await expect(widget).toBeVisible({ timeout: 10_000 });

    // Open the dialog
    await widget.getByTestId('es-settings-btn').click();
    await page.getByTestId('es-exclude-categories-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click on "Food" label to check it
    const foodLabel = dialog.locator('label').filter({ hasText: 'Food' }).first();
    await expect(foodLabel).toBeVisible();
    await foodLabel.click();

    // The checkbox should be checked
    const checkbox = foodLabel.locator('button[role="checkbox"]');
    await expect(checkbox).toHaveAttribute('data-state', 'checked');

    // Click Save
    await page.getByTestId('es-save-exclusions-btn').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // The warning icon should now appear in the widget title
    const warningIcon = page.getByTestId('es-excluded-warning');
    await expect(warningIcon).toBeVisible({ timeout: 10_000 });

    // Click the warning icon to open excluded categories popover
    await warningIcon.click();

    // Popover should show the excluded category name
    const popover = page.getByTestId('es-excluded-popover');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(popover.getByText('Food & Drinks')).toBeVisible();
  });

  test('excluded category persists after page reload', async ({ page }) => {
    await expect(page.getByTestId('widget-expenses-structure')).toBeVisible({ timeout: 10_000 });

    // The warning icon should be visible (from previous test's exclusion)
    await expect(page.getByTestId('es-excluded-warning')).toBeVisible({ timeout: 10_000 });

    // Reload the page
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Warning icon should still be visible after reload
    await expect(page.getByTestId('widget-expenses-structure')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('es-excluded-warning')).toBeVisible({ timeout: 10_000 });
  });

  test('remove exclusion via the warning popover', async ({ page }) => {
    await expect(page.getByTestId('widget-expenses-structure')).toBeVisible({ timeout: 10_000 });

    // Click the warning icon to open the excluded categories popover
    const warningIcon = page.getByTestId('es-excluded-warning');
    await expect(warningIcon).toBeVisible({ timeout: 10_000 });
    await warningIcon.click();

    // The popover should show the excluded category with a remove button
    const popover = page.getByTestId('es-excluded-popover');
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(popover.getByText('Food & Drinks')).toBeVisible();

    // Click the first X button to remove a category exclusion
    await popover.locator('button').first().click();

    // Keep removing until all are gone (parent check added all subcategories)
    while ((await popover.locator('button').count()) > 0) {
      await popover.locator('button').first().click();
      await page.waitForTimeout(300);
    }

    // Warning icon should disappear (no more exclusions)
    await expect(warningIcon).not.toBeVisible({ timeout: 10_000 });
  });
});
