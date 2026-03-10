import { test, expect } from '@playwright/test';

import { completeOnboarding, createAccount } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'cst' });

let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Category Spending Tracker Widget', () => {
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

  test('add widget to dashboard via edit mode', async ({ page }) => {
    // Enter dashboard edit mode
    const customizeBtn = page.getByRole('button', { name: /customize/i }).first();
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    await customizeBtn.click();

    // Find the add widgets panel and click the category tracker widget
    const addPanel = page.locator('.border-dashed').filter({ hasText: /add/i }).last();
    await expect(addPanel).toBeVisible({ timeout: 5_000 });

    const categoryWidgetBtn = addPanel
      .locator('button')
      .filter({ hasText: /categor/i })
      .first();
    await expect(categoryWidgetBtn).toBeVisible();
    await categoryWidgetBtn.click();

    // Save the dashboard layout
    const doneBtn = page.getByRole('button', { name: /done/i }).first();
    await expect(doneBtn).toBeVisible();
    await doneBtn.click();

    // Verify widget appears with ghost slots
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByTestId('cst-add-slot').first()).toBeVisible();
  });

  test('add first category', async ({ page }) => {
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget).toBeVisible({ timeout: 10_000 });

    // Click ghost slot to open category picker
    await widget.getByTestId('cst-add-slot').first().click();

    // Select "Food" from the picker dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator('button').filter({ hasText: 'Food' }).first().click();

    // Verify dialog closes and category appears
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });
  });

  test('add second category with first disabled in picker', async ({ page }) => {
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });

    // Click ghost slot
    await widget.getByTestId('cst-add-slot').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // "Food" should be disabled (already selected)
    await expect(dialog.locator('button').filter({ hasText: 'Food' }).first()).toBeDisabled();

    // Select "Shopping"
    await dialog.locator('button').filter({ hasText: 'Shopping' }).first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Both categories visible
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Shopping')).toBeVisible({ timeout: 10_000 });
  });

  test('remove category', async ({ page }) => {
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Shopping')).toBeVisible({ timeout: 10_000 });

    // Enter widget customize mode
    await widget.getByTestId('cst-customize-toggle').click();

    // Remove "Shopping" via its trash button
    const shoppingRow = widget.locator('.cursor-pointer').filter({ hasText: 'Shopping' });
    await shoppingRow.getByTestId('cst-remove-category').click();

    // Exit customize mode
    await widget.getByTestId('cst-customize-toggle').click();

    // Shopping removed, Food remains
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Shopping')).not.toBeVisible({ timeout: 5_000 });
  });

  test('replace category', async ({ page }) => {
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });

    // Add Shopping back for the replacement test
    await widget.getByTestId('cst-add-slot').first().click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator('button').filter({ hasText: 'Shopping' }).first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(widget.getByText('Shopping')).toBeVisible({ timeout: 10_000 });

    // Enter customize mode
    await widget.getByTestId('cst-customize-toggle').click();

    // Click on Shopping's name to open picker for replacement
    await widget.locator('span.truncate').filter({ hasText: 'Shopping' }).click();

    // Picker opens for replacement
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Food should be disabled (selected and not the one being replaced)
    await expect(dialog.locator('button').filter({ hasText: 'Food' }).first()).toBeDisabled();

    // Select Housing to replace Shopping
    await dialog.locator('button').filter({ hasText: 'Housing' }).first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Housing appears, Shopping gone
    await expect(widget.getByText('Housing')).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Shopping')).not.toBeVisible();

    // Exit customize mode
    await widget.getByTestId('cst-customize-toggle').click();
  });

  test('drag and drop to reorder categories', async ({ page }) => {
    const widget = page.getByTestId('widget-category-spending-tracker');
    await expect(widget.getByText('Food')).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Housing')).toBeVisible({ timeout: 10_000 });

    // Enter customize mode
    await widget.getByTestId('cst-customize-toggle').click();

    // Get drag handles
    const handles = widget.locator('.drag-handle');
    await expect(handles).toHaveCount(2);

    // Drag first item (Food) below second item (Housing)
    const firstHandle = handles.nth(0);
    const secondHandle = handles.nth(1);

    const firstBox = await firstHandle.boundingBox();
    const secondBox = await secondHandle.boundingBox();

    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // Use mouse events for SortableJS compatibility
    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
    await page.mouse.down();
    // Move slowly past the second item to trigger reorder
    await page.mouse.move(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height + 10, { steps: 15 });
    await page.mouse.up();

    // Wait for SortableJS animation (200ms)
    await page.waitForTimeout(300);

    // Exit customize mode (persists the new order)
    await widget.getByTestId('cst-customize-toggle').click();

    // Reload page to verify order persisted
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    const reloadedWidget = page.getByTestId('widget-category-spending-tracker');
    await expect(reloadedWidget).toBeVisible({ timeout: 10_000 });

    // Verify Housing is now first, Food second
    const names = reloadedWidget.locator('button > span.truncate');
    await expect(names).toHaveCount(2, { timeout: 10_000 });

    const texts = await names.allTextContents();
    expect(texts[0]).toBe('Housing');
    expect(texts[1]).toBe('Food & Drinks');
  });
});
