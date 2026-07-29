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
    const allRows = dialog.locator('[data-testid^="ec-row-"]');
    const initialCount = await allRows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Search for "Food". A matching parent keeps its whole subtree, so this still
    // drops every unrelated root rather than collapsing to a single row.
    const searchInput = dialog.locator('input[type="text"]');
    await searchInput.fill('Food');
    await expect(allRows).not.toHaveCount(initialCount);

    const filteredCount = await allRows.count();
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Clear search
    await page.getByTestId('ec-search-clear').click();
    await expect(allRows).toHaveCount(initialCount);
  });

  test('select a category, save, dialog closes, and the badge shows it', async ({ page }) => {
    const widget = page.getByTestId('widget-expenses-structure');
    await expect(widget).toBeVisible({ timeout: 10_000 });

    // Open the dialog
    await widget.getByTestId('es-settings-btn').click();
    await page.getByTestId('es-exclude-categories-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The row itself is the control — clicking it excludes the category and its subtree
    const foodRow = dialog.locator('[data-testid^="ec-row-"]').filter({ hasText: 'Food & Drinks' }).first();
    await expect(foodRow).toBeVisible();
    await foodRow.click();

    // The chip strip is the confirmation that it took, and lists the parent first
    const chips = dialog.getByTestId('ec-chips');
    await expect(chips).toBeVisible();
    await expect(chips.getByText('Food & Drinks')).toBeVisible();

    // Click Save
    await page.getByTestId('ec-save-btn').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // The count badge should now appear in the widget title
    await expect(page.getByTestId('es-excluded-badge')).toBeVisible({ timeout: 10_000 });
  });

  test('excluded category persists after page reload', async ({ page }) => {
    await expect(page.getByTestId('widget-expenses-structure')).toBeVisible({ timeout: 10_000 });

    // The badge should be visible (from previous test's exclusion)
    await expect(page.getByTestId('es-excluded-badge')).toBeVisible({ timeout: 10_000 });

    // Reload the page
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Badge should still be visible after reload
    await expect(page.getByTestId('widget-expenses-structure')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('es-excluded-badge')).toBeVisible({ timeout: 10_000 });
  });

  test('a chip removes one exclusion and Clear all removes the rest', async ({ page }) => {
    const widget = page.getByTestId('widget-expenses-structure');
    await expect(widget).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('es-excluded-badge')).toBeVisible({ timeout: 10_000 });

    // Reopen the dialog — exclusions are managed inside it, not from the badge
    await widget.getByTestId('es-settings-btn').click();
    await page.getByTestId('es-exclude-categories-btn').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Checking the parent excluded its subcategories too, so the strip lists it plus children
    const chips = dialog.getByTestId('ec-chips');
    await expect(chips).toBeVisible();
    await expect(chips.getByText('Food & Drinks', { exact: true })).toBeVisible();
    expect(await chips.locator('button').count()).toBeGreaterThan(1);

    // Remove a subcategory chip — the parent's chip keeps the strip alive. Clicking the parent
    // chip instead would take its whole subtree, same as clicking the parent row.
    const childChip = chips.locator('button').filter({ hasNotText: 'Food & Drinks' }).first();
    const childName = (await childChip.innerText()).trim();
    await childChip.click();
    await expect(chips.getByText(childName, { exact: true })).toHaveCount(0);
    await expect(chips).toBeVisible();

    // Clear all drops the remainder and the strip goes away with them
    await dialog.getByTestId('ec-clear-all').click();
    await expect(chips).not.toBeVisible();

    await page.getByTestId('ec-save-btn').click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Badge disappears once nothing is excluded
    await expect(page.getByTestId('es-excluded-badge')).not.toBeVisible({ timeout: 10_000 });
  });
});
