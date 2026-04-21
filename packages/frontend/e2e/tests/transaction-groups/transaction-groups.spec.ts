import { test, expect } from '@playwright/test';

import { completeOnboarding, createAccount, createTransaction, createTransactionGroup } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'tg' });

/** Extract entity ID from API response, handling `{ response: { id } }`, `{ response: [{ id }] }`, and `{ id }` shapes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractId = (apiResult: any): number => {
  const resp = apiResult.response;
  const id = Array.isArray(resp) ? resp[0]?.id : (resp?.id ?? apiResult.id);
  if (!id || id <= 0) {
    throw new Error(`Failed to extract valid ID from API response: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
};

let accountId: number;
// Transaction IDs used across tests
const txIds: number[] = [];
// Extra transactions for "add to existing group" tests
const extraTxIds: number[] = [];

let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Transaction Groups', () => {
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
        name: 'Test Account',
        currencyCode: CURRENCY,
        initialBalance: 10000,
      });
      accountId = extractId(account);

      // Create 5 transactions for group creation tests
      for (let i = 0; i < 5; i++) {
        const tx = await createTransaction({
          request: page.request,
          accountId,
          amount: (i + 1) * 10,
          transactionType: 'expense',
        });
        txIds.push(extractId(tx));
      }

      // Create 2 extra transactions for add-to-group tests
      for (let i = 0; i < 2; i++) {
        const tx = await createTransaction({
          request: page.request,
          accountId,
          amount: (i + 1) * 100,
          transactionType: 'income',
        });
        extraTxIds.push(extractId(tx));
      }

      dataSeeded = true;
    }
  });

  // ─── 1. Create a group from selected transactions on /transactions ───

  test('select transactions and create a new group', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Wait for transactions list to load
    await expect(page.locator('[aria-haspopup="true"]').first()).toBeVisible({ timeout: 10_000 });

    // Click the first checkbox to enter bulk edit mode, then select 3 transactions
    const checkboxes = page.locator('[aria-haspopup="true"] label');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    // Open the Group dropdown (desktop)
    const groupButton = page.locator('button').filter({ hasText: /group/i }).first();
    await expect(groupButton).toBeVisible();
    await groupButton.click();

    // Click "Create New Group"
    const createOption = page.getByRole('menuitem', { name: /create new group/i });
    await expect(createOption).toBeVisible();
    await createOption.click();

    // Fill create group dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('input').first().fill('E2E Test Group');
    await dialog.locator('textarea').fill('Created by e2e test');

    // Submit
    const submitButton = dialog.locator('button[type="submit"]').filter({ hasNotText: /cancel/i });
    await submitButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Group row should appear in the transactions list
    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Test Group' });
    await expect(groupRow).toBeVisible({ timeout: 10_000 });
  });

  // ─── 2. Group row is visible and shows correct count ────────────────

  test('group row shows transaction count', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Test Group' });
    await expect(groupRow).toBeVisible({ timeout: 10_000 });

    // Should show "3" somewhere in the count text
    await expect(groupRow.getByText('3')).toBeVisible();
  });

  // ─── 3. Click on group row opens group detail dialog ────────────────

  test('clicking group row opens detail dialog', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Test Group' });
    await expect(groupRow).toBeVisible({ timeout: 10_000 });
    await groupRow.click();

    // Group dialog should open with the group name
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('E2E Test Group')).toBeVisible();

    // Should show transactions inside the dialog
    const transactionRows = dialog.locator('[aria-haspopup="true"]');
    await expect(transactionRows).toHaveCount(3, { timeout: 10_000 });
  });

  // ─── 4. Items inside group are clickable (opens manage tx dialog) ───

  test('transaction inside group dialog is clickable', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Open the group detail dialog
    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Test Group' });
    await expect(groupRow).toBeVisible({ timeout: 10_000 });
    await groupRow.click();

    const groupDialog = page.getByRole('dialog');
    await expect(groupDialog).toBeVisible({ timeout: 5_000 });

    // Click on a transaction row inside the group dialog
    const transactionRow = groupDialog.locator('[aria-haspopup="true"]').first();
    await expect(transactionRow).toBeVisible({ timeout: 10_000 });
    await transactionRow.click();

    // The manage transaction dialog opens (replaces the group dialog)
    // It should show "Edit Transaction" content with amount, account, category fields
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Amount')).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Category')).toBeVisible();

    // Close the manage tx dialog
    await dialog.getByText('Close').click();
    await page.waitForTimeout(500);
  });

  // ─── 5. Edit group name from the detail dialog ──────────────────────

  test('edit group name via detail dialog', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Open group detail dialog
    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Test Group' });
    await expect(groupRow).toBeVisible({ timeout: 10_000 });
    await groupRow.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('E2E Test Group')).toBeVisible({ timeout: 5_000 });

    // Open actions popover (ellipsis menu) — the button with ml-auto in the dialog header
    await dialog.locator('button.ml-auto').click();

    // Click Edit inside the actions menu (renders as a separate dialog in reka-ui)
    const actionsMenu = page.getByRole('dialog').filter({ hasText: /delete group/i });
    await expect(actionsMenu).toBeVisible({ timeout: 5_000 });
    await actionsMenu.getByRole('button', { name: 'Edit' }).click();

    // Edit dialog should open (now there are 2 dialogs: group detail + edit form)
    const editDialog = page.getByRole('dialog').filter({ has: page.locator('textarea') });
    await expect(editDialog).toBeVisible({ timeout: 5_000 });

    // Clear and type new name
    const nameInput = editDialog.locator('input').first();
    await nameInput.clear();
    await nameInput.fill('E2E Renamed Group');

    // Save
    const saveButton = editDialog.locator('button').filter({ hasText: /save/i });
    await saveButton.click();

    // Edit dialog closes, only the group detail dialog remains
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    // The group dialog title should update
    await expect(dialog.getByText('E2E Renamed Group')).toBeVisible({ timeout: 10_000 });

    // Close group dialog
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });

    // Group row on the page should show updated name
    await expect(page.locator('.border-dashed').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({
      timeout: 10_000,
    });
  });

  // ─── 6. Add transactions to existing group ──────────────────────────

  test('add transactions to existing group via bulk toolbar', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Wait for transactions list to load
    await expect(page.locator('[aria-haspopup="true"]').first()).toBeVisible({ timeout: 10_000 });

    // Select ungrouped transactions (they should be the income ones - extra txs)
    const checkboxes = page.locator('[aria-haspopup="true"] label');
    // Need to find ungrouped transactions - pick the first available checkbox
    await checkboxes.nth(0).click();

    // Open Group dropdown
    const groupButton = page.locator('button').filter({ hasText: /group/i }).first();
    await expect(groupButton).toBeVisible();
    await groupButton.click();

    // Click "Add to Existing Group"
    const addOption = page.getByRole('menuitem', { name: /add to existing/i });
    await expect(addOption).toBeVisible();
    await addOption.click();

    // Add to group dialog should open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should show the renamed group
    const groupItem = dialog.locator('button').filter({ hasText: 'E2E Renamed Group' });
    await expect(groupItem).toBeVisible({ timeout: 10_000 });
    await groupItem.click();

    // Submit
    const addButton = dialog
      .locator('button')
      .filter({ hasNotText: /cancel/i })
      .last();
    await addButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  // ─── 7. Group visible on /transaction-groups page ───────────────────

  test('group is accessible on /transaction-groups page', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Wait for groups list to load
    const groupCard = page.locator('h3').filter({ hasText: 'E2E Renamed Group' });
    await expect(groupCard).toBeVisible({ timeout: 10_000 });
  });

  // ─── 8. Search/filter works on /transaction-groups ──────────────────

  test('search filters groups on /transaction-groups page', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Verify the group card is visible initially
    await expect(page.locator('h3').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({ timeout: 10_000 });

    // Type a non-matching search
    const searchInput = page.locator('input').first();
    await searchInput.fill('zzz-nonexistent');

    // Group should disappear
    await expect(page.locator('h3').filter({ hasText: 'E2E Renamed Group' })).not.toBeVisible({ timeout: 5_000 });

    // Clear and type a matching search
    await searchInput.clear();
    await searchInput.fill('Renamed');

    // Group should reappear
    await expect(page.locator('h3').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({ timeout: 5_000 });
  });

  // ─── 9. Click group card on /transaction-groups opens detail dialog ─

  test('clicking group card on groups page opens detail dialog', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    const groupCard = page.locator('h3').filter({ hasText: 'E2E Renamed Group' }).locator('..');
    await expect(groupCard).toBeVisible({ timeout: 10_000 });

    // Click the card (click the h3 text to avoid the delete button)
    await page.locator('h3').filter({ hasText: 'E2E Renamed Group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('E2E Renamed Group')).toBeVisible();

    // Close dialog
    await page.keyboard.press('Escape');
  });

  // ─── 10. Edit group name from /transaction-groups page ──────────────

  test('edit group from groups page detail dialog', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Open group detail
    await page.locator('h3').filter({ hasText: 'E2E Renamed Group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Open actions popover
    await dialog.locator('button.ml-auto').click();

    // Click Edit inside the actions menu
    const actionsMenu = page.getByRole('dialog').filter({ hasText: /delete group/i });
    await expect(actionsMenu).toBeVisible({ timeout: 5_000 });
    await actionsMenu.getByRole('button', { name: 'Edit' }).click();

    // Edit dialog
    const editDialog = page.getByRole('dialog').filter({ has: page.locator('textarea') });
    await expect(editDialog).toBeVisible({ timeout: 5_000 });

    // Update note
    const noteTextarea = editDialog.locator('textarea');
    await noteTextarea.clear();
    await noteTextarea.fill('Updated note from groups page');

    // Save
    await editDialog.locator('button').filter({ hasText: /save/i }).click();

    // Edit dialog closes
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    // Close the detail dialog
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });

    // The note should now be visible on the card
    await expect(page.getByText('Updated note from groups page')).toBeVisible({ timeout: 10_000 });
  });

  // ─── 11. Remove transaction from group shows confirmation ───────────

  test('removing a transaction from group shows confirmation dialog', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Open group detail
    await page.locator('h3').filter({ hasText: 'E2E Renamed Group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for transactions to load
    const transactionRows = dialog.locator('[aria-haspopup="true"]');
    await expect(transactionRows.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await transactionRows.count();

    // Click remove button (X icon) on first transaction
    const removeButton = dialog
      .locator('button')
      .filter({ has: page.locator('svg.size-3\\.5') })
      .first();
    await removeButton.click();

    // Confirmation dialog should appear (alert dialog)
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });

    // Confirm removal
    const confirmButton = alertDialog.locator('button').filter({ hasText: /remove/i });
    await confirmButton.click();

    // Alert dialog closes
    await expect(alertDialog).not.toBeVisible({ timeout: 5_000 });

    // Transaction count should decrease
    await expect(transactionRows).toHaveCount(initialCount - 1, { timeout: 10_000 });

    // Close group dialog
    await page.keyboard.press('Escape');
  });

  // ─── 12. Group row visible on dashboard "Latest Transactions" widget ─

  test('group appears in the latest transactions widget on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Look for a group row (dashed border) on the dashboard
    const groupRow = page.locator('.border-dashed').filter({ hasText: 'E2E Renamed Group' });
    await expect(groupRow).toBeVisible({ timeout: 15_000 });
  });

  // ─── 13. Navigation: sidebar has "Groups" link ──────────────────────

  test('sidebar navigation has Groups link', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // On desktop the sidebar should have a Groups link
    const groupsLink = page.locator('a[href="/transaction-groups"]');
    await expect(groupsLink).toBeVisible({ timeout: 10_000 });

    // Click it to navigate
    await groupsLink.click();
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Verify we're on the groups page
    await expect(page.locator('h1').filter({ hasText: /group/i })).toBeVisible({ timeout: 10_000 });
  });

  // ─── 14. Delete group from /transaction-groups page ─────────────────

  test('delete group from groups page with confirmation', async ({ page }) => {
    // First, create a second group via API to delete (keep the main one)
    const tx1 = await createTransaction({
      request: page.request,
      accountId,
      amount: 5,
      transactionType: 'expense',
    });
    const tx2 = await createTransaction({
      request: page.request,
      accountId,
      amount: 6,
      transactionType: 'expense',
    });
    await createTransactionGroup({
      request: page.request,
      name: 'Group To Delete',
      transactionIds: [extractId(tx1), extractId(tx2)],
    });

    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Both groups should be visible
    await expect(page.locator('h3').filter({ hasText: 'Group To Delete' })).toBeVisible({ timeout: 10_000 });

    // Click the delete (trash) button on "Group To Delete" card
    const deleteCard = page.locator('h3').filter({ hasText: 'Group To Delete' }).locator('..').locator('..');
    const deleteButton = deleteCard.locator('button').last();
    await deleteButton.click();

    // Confirmation dialog appears
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });

    // Confirm deletion
    const confirmButton = alertDialog.locator('button').filter({ hasText: /delete/i });
    await confirmButton.click();

    // Alert dialog closes
    await expect(alertDialog).not.toBeVisible({ timeout: 5_000 });

    // "Group To Delete" should be gone
    await expect(page.locator('h3').filter({ hasText: 'Group To Delete' })).not.toBeVisible({ timeout: 10_000 });

    // The main group should still exist
    await expect(page.locator('h3').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({ timeout: 5_000 });
  });

  // ─── 15. Create group with minimum 2 transactions (validation) ──────

  test('cannot create group with less than 2 transactions', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Wait for transactions list
    await expect(page.locator('[aria-haspopup="true"]').first()).toBeVisible({ timeout: 10_000 });

    // Select only 1 transaction
    const checkboxes = page.locator('[aria-haspopup="true"] label');
    await checkboxes.nth(0).click();

    // Open Group dropdown
    const groupButton = page.locator('button').filter({ hasText: /group/i }).first();
    await expect(groupButton).toBeVisible();
    await groupButton.click();

    // "Create New Group" should be disabled when only 1 is selected
    const createOption = page.getByRole('menuitem', { name: /create new group/i });
    await expect(createOption).toBeDisabled();
  });

  // ─── 16. Search in add-to-group dialog ──────────────────────────────

  test('add to group dialog has working search', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    await expect(page.locator('[aria-haspopup="true"]').first()).toBeVisible({ timeout: 10_000 });

    // Select a transaction
    const checkboxes = page.locator('[aria-haspopup="true"] label');
    await checkboxes.nth(0).click();

    // Open Group dropdown > Add to existing
    const groupButton = page.locator('button').filter({ hasText: /group/i }).first();
    await groupButton.click();
    await page.getByRole('menuitem', { name: /add to existing/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Group should be visible initially
    await expect(dialog.locator('button').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({ timeout: 10_000 });

    // Type non-matching search
    const searchInput = dialog.locator('input');
    await searchInput.fill('zzz-nonexistent');

    // Group should disappear
    await expect(dialog.locator('button').filter({ hasText: 'E2E Renamed Group' })).not.toBeVisible({ timeout: 5_000 });

    // Clear and type matching search
    await searchInput.clear();
    await searchInput.fill('Renamed');

    // Group should reappear
    await expect(dialog.locator('button').filter({ hasText: 'E2E Renamed Group' })).toBeVisible({ timeout: 5_000 });

    // Close dialog
    await dialog
      .locator('button')
      .filter({ hasText: /cancel/i })
      .click();
  });

  // ─── 17. Group note displayed on groups page card ───────────────────

  test('group note is displayed on groups page card', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // The note we set in test 10 should be visible
    await expect(page.getByText('Updated note from groups page')).toBeVisible({ timeout: 10_000 });
  });

  // ─── 18. Group dissolves when removing transactions below minimum ───

  test('group dissolves when last transactions are removed', async ({ page }) => {
    // Create a group with exactly 2 transactions via API
    const tx1 = await createTransaction({
      request: page.request,
      accountId,
      amount: 1,
      transactionType: 'expense',
    });
    const tx2 = await createTransaction({
      request: page.request,
      accountId,
      amount: 2,
      transactionType: 'expense',
    });
    await createTransactionGroup({
      request: page.request,
      name: 'Dissolving Group',
      transactionIds: [extractId(tx1), extractId(tx2)],
    });

    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Open the group
    await page.locator('h3').filter({ hasText: 'Dissolving Group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for transactions to load
    await expect(dialog.locator('[aria-haspopup="true"]')).toHaveCount(2, { timeout: 10_000 });

    // Click remove on the first transaction
    const removeButton = dialog
      .locator('button')
      .filter({ has: page.locator('svg.size-3\\.5') })
      .first();
    await removeButton.click();

    // Confirmation with "Remove and Delete" should appear (because <= 2 transactions)
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });
    await expect(alertDialog.locator('button').filter({ hasText: /remove/i })).toBeVisible();

    // Confirm
    await alertDialog
      .locator('button')
      .filter({ hasText: /remove/i })
      .click();

    // Dialog should close (group dissolved)
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Group should no longer appear in the list
    await expect(page.locator('h3').filter({ hasText: 'Dissolving Group' })).not.toBeVisible({ timeout: 10_000 });
  });

  // ─── 19. Empty state on /transaction-groups when no groups exist ────

  test('empty state shown when no groups match search', async ({ page }) => {
    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Type a non-matching search
    const searchInput = page.locator('input').first();
    await searchInput.fill('zzz-no-match-at-all-123');

    // Empty state message should appear
    await expect(page.getByText(/no groups match/i)).toBeVisible({ timeout: 5_000 });
  });

  // ─── 20. Delete group via detail dialog ─────────────────────────────

  test('delete group from detail dialog', async ({ page }) => {
    // Create a disposable group
    const tx1 = await createTransaction({
      request: page.request,
      accountId,
      amount: 3,
      transactionType: 'expense',
    });
    const tx2 = await createTransaction({
      request: page.request,
      accountId,
      amount: 4,
      transactionType: 'expense',
    });
    await createTransactionGroup({
      request: page.request,
      name: 'Dialog Delete Group',
      transactionIds: [extractId(tx1), extractId(tx2)],
    });

    await page.goto('/transaction-groups');
    await page.waitForURL(/\/transaction-groups/, { timeout: 15_000 });

    // Open group detail
    await page.locator('h3').filter({ hasText: 'Dialog Delete Group' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Open actions popover
    await dialog.locator('button.ml-auto').click();

    // Click "Delete Group" button directly (its accessible name is unique)
    await page.getByRole('button', { name: 'Delete Group' }).click();

    // Confirmation appears
    const alertDialog = page.getByRole('alertdialog');
    await expect(alertDialog).toBeVisible({ timeout: 5_000 });

    // Confirm deletion
    await alertDialog.getByRole('button', { name: /delete/i }).click();

    // Both dialogs close
    await expect(alertDialog).not.toBeVisible({ timeout: 5_000 });
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Group should be gone from the list
    await expect(page.locator('h3').filter({ hasText: 'Dialog Delete Group' })).not.toBeVisible({ timeout: 10_000 });
  });
});
