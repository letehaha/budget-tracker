import { test, expect } from '@playwright/test';

import {
  API_BASE_URL,
  completeOnboarding,
  createAccount,
  createPaymentReminder,
  createTransaction,
  markReminderPeriodPaid,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'pr' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractId = (apiResult: any): string => {
  const resp = apiResult.response;
  const id = resp?.id ?? apiResult.id;
  if (!id) {
    throw new Error(`Failed to extract ID from API response: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractNumericId = (apiResult: any): number => {
  const resp = apiResult.response;
  const id = Array.isArray(resp) ? resp[0]?.id : (resp?.id ?? apiResult.id);
  if (!id || id <= 0) {
    throw new Error(`Failed to extract numeric ID: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
};

let accountId: number;
let dataSeeded = false;

// Due dates: today for "actionable" periods (due today counts as actionable),
// far future for "non-actionable". Backend rejects past dates.
const todayStr = new Date().toISOString().split('T')[0]!;

const future = new Date();
future.setDate(future.getDate() + 30);
const futureStr = future.toISOString().split('T')[0]!;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Payment Reminders', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });

    if (!dataSeeded) {
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

      const account = await createAccount({
        request: page.request,
        name: 'Reminder Test Account',
        currencyCode: CURRENCY,
        initialBalance: 50000,
      });
      accountId = extractNumericId(account);
      dataSeeded = true;
    }
  });

  // ─── Navigation ───────────────────────────────────────────────────

  test('19. sidebar has Reminders link under Planned', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Click the "Planned" text in the sidebar to expand the collapsible
    const plannedText = page.locator('span').filter({ hasText: /^Planned$/ });
    await expect(plannedText).toBeVisible({ timeout: 10_000 });
    await plannedText.click();

    // Wait for collapsible to expand and look for the Reminders link by text
    const remindersLink = page.locator('a').filter({ hasText: 'Reminders' });
    await expect(remindersLink).toBeVisible({ timeout: 10_000 });

    await remindersLink.click();
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });
  });

  // ─── Empty state ──────────────────────────────────────────────────

  test('1. empty state shown when no reminders exist', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    await expect(page.getByText('No reminders yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'New Reminder' }).first()).toBeVisible();
  });

  // ─── Create reminders ─────────────────────────────────────────────

  test('2. create a one-off reminder with minimal fields', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Click "New Reminder"
    await page.locator('button').filter({ hasText: 'New Reminder' }).first().click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'New Reminder' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill name
    await dialog.locator('input').first().fill('Property Tax');

    // Fill due date using the datetime-local input
    const dateInput = dialog.locator('input[type="datetime-local"]');
    await dateInput.fill(`${todayStr}T00:00`);

    // Submit and wait for API response
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/payment-reminders') && resp.request().method() === 'POST'),
      dialog.locator('button').filter({ hasText: 'Create' }).click(),
    ]);

    // Reminder should appear in the list (confirms success regardless of dialog state)
    await expect(page.getByText('Property Tax')).toBeVisible({ timeout: 10_000 });
  });

  test('3. create a recurring reminder via API and verify it shows in list', async ({ page }) => {
    // Create via API (Select inside Dialog has portal rendering issues in Playwright)
    await createPaymentReminder({
      request: page.request,
      name: 'Monthly Rent',
      dueDate: todayStr,
      frequency: 'monthly',
      expectedAmount: 1200,
      currencyCode: 'USD',
      remindBefore: ['1_day', '1_week'],
    });

    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    await expect(page.getByText('Monthly Rent')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Monthly', { exact: true })).toBeVisible();
  });

  test('4. create reminder validation - submit disabled without name', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    await page.locator('button').filter({ hasText: 'New Reminder' }).first().click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'New Reminder' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Don't fill name — Create button should be disabled
    const createButton = dialog.locator('button').filter({ hasText: 'Create' });
    await expect(createButton).toBeDisabled();

    // Close dialog
    await dialog.locator('button').filter({ hasText: 'Cancel' }).click();
  });

  // ─── Navigate to details ──────────────────────────────────────────

  test('5. click reminder card navigates to details', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Click on the "Monthly Rent" card (not on an action button)
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Click the card text area (not the action buttons)
    await card.locator('p').filter({ hasText: 'Monthly Rent' }).click();

    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });
  });

  // ─── List quick actions ───────────────────────────────────────────

  test('7. mark as paid button hidden for future due date reminder', async ({ page }) => {
    // Create a reminder with a far-future due date via API
    await createPaymentReminder({
      request: page.request,
      name: 'Future Bill',
      dueDate: futureStr,
    });

    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // The "Future Bill" card should be visible
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Future Bill' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // The mark-as-paid button (checkmark icon) should NOT be visible in the card's action area
    const actionArea = card.locator('[class*="click.stop"], div').last();
    const checkButton = actionArea.locator('button[title="Mark as paid"]');
    await expect(checkButton).toHaveCount(0);
  });

  test('6. mark as paid on list page for overdue reminder', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // "Property Tax" was created with today's date, should be actionable (due today)
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Property Tax' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Click the mark-as-paid button
    const payButton = card.locator('button[title="Mark as paid"]');
    await expect(payButton).toBeVisible({ timeout: 5_000 });
    await payButton.click();

    // Wait for the mutation to complete — card should disappear (one-off, no more active periods)
    await expect(card).not.toBeVisible({ timeout: 10_000 });
  });

  test('8. skip period on list page', async ({ page }) => {
    // Monthly Rent should be actionable (created with today's date)
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Click skip button
    const skipButton = card.locator('button[title="Skip period"]');
    await expect(skipButton).toBeVisible({ timeout: 5_000 });
    await skipButton.click();

    // After skipping, a new upcoming period is generated (monthly).
    // The card should still be visible with updated due date
    await expect(card).toBeVisible({ timeout: 10_000 });
  });

  // ─── Delete from list ─────────────────────────────────────────────

  test('9. delete reminder from list with confirmation', async ({ page }) => {
    // Create a reminder to delete
    await createPaymentReminder({
      request: page.request,
      name: 'Delete Me',
      dueDate: todayStr,
    });

    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Delete Me' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Click delete button on the card
    const deleteButton = card.locator('button[title="Delete"]');
    await deleteButton.click();

    // Confirmation dialog appears
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await expect(alertDialog.getByText('Delete Me')).toBeVisible();

    // Confirm deletion
    await alertDialog
      .locator('button')
      .filter({ hasText: /delete/i })
      .click();

    // Dialog closes and reminder is gone
    await expect(alertDialog).not.toBeVisible({ timeout: 5_000 });
    await expect(card).not.toBeVisible({ timeout: 10_000 });
  });

  // ─── Details page ─────────────────────────────────────────────────

  test('10. view reminder details', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Navigate to Monthly Rent details
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await card.locator('p').filter({ hasText: 'Monthly Rent' }).click();
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Verify details are shown
    await expect(page.locator('h1').filter({ hasText: 'Monthly Rent' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Monthly', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment History')).toBeVisible();
  });

  test('11. edit reminder from details page', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Navigate to Monthly Rent details
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await card.locator('p').filter({ hasText: 'Monthly Rent' }).click();
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Click Edit
    await page.locator('button').filter({ hasText: 'Edit' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Edit Reminder' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Change the notes (expand extra options first)
    await dialog.getByText('Extra options').click();
    const notesTextarea = dialog.locator('textarea');
    await notesTextarea.fill('Updated rent note');

    // Save and wait for API
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/payment-reminders') && resp.request().method() === 'PUT'),
      dialog.locator('button').filter({ hasText: 'Save' }).click(),
    ]);
  });

  test('13. delete reminder from details page redirects to list', async ({ page }) => {
    // Create a reminder to delete from details
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Delete From Details',
      dueDate: todayStr,
    });
    const id = extractId(result);

    await page.goto(`/planned/reminders/${id}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    await expect(page.locator('h1').filter({ hasText: 'Delete From Details' })).toBeVisible({ timeout: 10_000 });

    // Click Delete
    await page.locator('button').filter({ hasText: 'Delete' }).click();

    // Confirmation
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await alertDialog
      .locator('button')
      .filter({ hasText: /delete/i })
      .click();

    // Should redirect back to list
    await page.waitForURL(/\/planned\/reminders$/, { timeout: 15_000 });
  });

  // ─── Period actions on details page ───────────────────────────────

  test('14. period history shows grouped by month', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Navigate to Monthly Rent (which has at least 1 skipped period + 1 upcoming)
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await card.locator('p').filter({ hasText: 'Monthly Rent' }).click();
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Should see period entries
    await expect(page.getByText('Payment History')).toBeVisible({ timeout: 10_000 });
    // At least one status badge should be visible
    await expect(page.getByText(/Skipped|Upcoming|Paid|Overdue/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('15. mark period as paid from details page', async ({ page }) => {
    // Create a reminder with overdue period
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Pay From Details',
      dueDate: todayStr,
      frequency: 'monthly',
    });
    const id = extractId(result);

    await page.goto(`/planned/reminders/${id}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    await expect(page.locator('h1').filter({ hasText: 'Pay From Details' })).toBeVisible({ timeout: 10_000 });

    // Click mark as paid button on the overdue period
    const payButton = page.locator('button[title="Mark as paid"]').first();
    await expect(payButton).toBeVisible({ timeout: 10_000 });
    await payButton.click();

    // Should now show "Paid" badge
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('16. skip period from details page', async ({ page }) => {
    // Create a reminder with overdue period
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Skip From Details',
      dueDate: todayStr,
    });
    const id = extractId(result);

    await page.goto(`/planned/reminders/${id}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    await expect(page.locator('h1').filter({ hasText: 'Skip From Details' })).toBeVisible({ timeout: 10_000 });

    // Click skip
    const skipButton = page.locator('button[title="Skip"]').first();
    await expect(skipButton).toBeVisible({ timeout: 10_000 });
    await skipButton.click();

    // Should show "Skipped" badge
    await expect(page.getByText('Skipped', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('17. unlink transaction from paid period', async ({ page }) => {
    // Create reminder, then mark as paid with a transaction via API
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Unlink TX Test',
      dueDate: todayStr,
    });
    const reminderId = extractId(result);
    const periodId = result.response.periods[0].id;

    // Create a transaction to link
    const tx = await createTransaction({
      request: page.request,
      accountId,
      amount: 500,
      transactionType: 'expense',
    });
    const txId = extractNumericId(tx);

    // Mark as paid with linked transaction
    await markReminderPeriodPaid({
      request: page.request,
      reminderId,
      periodId,
      transactionId: txId,
    });

    await page.goto(`/planned/reminders/${reminderId}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Should show linked transaction
    await expect(page.getByText(`Transaction #${txId}`)).toBeVisible({ timeout: 10_000 });

    // Click unlink button
    const unlinkButton = page.locator('button[title="Unlink transaction"]');
    await expect(unlinkButton).toBeVisible({ timeout: 5_000 });
    await unlinkButton.click();

    // Transaction reference should disappear
    await expect(page.getByText(`Transaction #${txId}`)).not.toBeVisible({ timeout: 10_000 });

    // Period should still show as Paid
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  });

  test('18. load more periods', async ({ page }) => {
    // Create a recurring reminder and pay several periods to build history
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Load More Test',
      dueDate: todayStr,
      frequency: 'monthly',
    });
    const reminderId = extractId(result);

    // Pay 7 periods to exceed the default limit of 6
    let currentPeriodId = result.response.periods[0].id;
    for (let i = 0; i < 7; i++) {
      await markReminderPeriodPaid({
        request: page.request,
        reminderId,
        periodId: currentPeriodId,
      });
      // Get the next period
      const resp = await page.request.get(
        `${API_BASE_URL}/api/v1/payment-reminders/${reminderId}/periods?limit=1&offset=0`,
      );
      const data = await resp.json();
      currentPeriodId = data.response.periods[0].id;
    }

    await page.goto(`/planned/reminders/${reminderId}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Should see "Load more" button (8 periods total, showing 6 by default)
    const loadMoreButton = page.locator('button').filter({ hasText: 'Load more' });
    await expect(loadMoreButton).toBeVisible({ timeout: 10_000 });

    // Click it
    await loadMoreButton.click();

    // After loading more, verify more period entries are visible
    // Each period has a "Due YYYY-MM-DD" text
    const periodEntries = page.getByText(/^Due \d{4}-/);
    await expect(periodEntries).not.toHaveCount(0, { timeout: 10_000 });
    const count = await periodEntries.count();
    expect(count).toBeGreaterThan(6);
  });

  // ─── Back link ────────────────────────────────────────────────────

  test('20. back link on details navigates to list', async ({ page }) => {
    await page.goto('/planned/reminders');
    await page.waitForURL(/\/planned\/reminders/, { timeout: 15_000 });

    // Navigate to a reminder
    const card = page.locator('.rounded-lg.border').filter({ hasText: 'Monthly Rent' });
    await card.locator('p').filter({ hasText: 'Monthly Rent' }).click();
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Click the back link
    const backLink = page.locator('a').filter({ hasText: /back to reminders/i });
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    await backLink.click();

    await page.waitForURL(/\/planned\/reminders$/, { timeout: 15_000 });
  });

  // ─── Recurring period generation ──────────────────────────────────

  test('21. next period generated after paying recurring reminder', async ({ page }) => {
    const result = await createPaymentReminder({
      request: page.request,
      name: 'Recurring Next Period',
      dueDate: todayStr,
      frequency: 'monthly',
    });
    const reminderId = extractId(result);

    await page.goto(`/planned/reminders/${reminderId}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Should have 1 period initially
    await expect(page.getByText('Payment History')).toBeVisible({ timeout: 10_000 });

    // Pay the overdue period
    const payButton = page.locator('button[title="Mark as paid"]').first();
    await payButton.click();

    // After paying, should see both "Paid" and "Upcoming" badges
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Upcoming')).toBeVisible({ timeout: 10_000 });
  });

  test('22. no next period for one-off reminder after paying', async ({ page }) => {
    const result = await createPaymentReminder({
      request: page.request,
      name: 'One-off No Next',
      dueDate: todayStr,
    });
    const reminderId = extractId(result);

    await page.goto(`/planned/reminders/${reminderId}`);
    await page.waitForURL(/\/planned\/reminders\//, { timeout: 15_000 });

    // Pay the period
    const payButton = page.locator('button[title="Mark as paid"]').first();
    await payButton.click();

    // Should show Paid but NOT Upcoming
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // Count period entries — should be exactly 1 (the paid one)
    // Use the "Due" text that appears in each period entry
    const periodEntries = page.getByText(/^Due \d{4}-/);
    await expect(periodEntries).toHaveCount(1, { timeout: 10_000 });
  });
});
