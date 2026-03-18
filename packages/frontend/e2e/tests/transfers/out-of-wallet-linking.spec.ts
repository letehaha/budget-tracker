import { test, expect } from '@playwright/test';

import { completeOnboarding, createAccount, createTransaction, linkTransactions } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'oow-link' });

/** Extract entity ID from API response, handling `{ response: { id } }`, `{ response: [{ id }] }`, and `{ id }` shapes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractId(apiResult: any): number {
  const resp = apiResult.response;
  const id = Array.isArray(resp) ? resp[0]?.id : (resp?.id ?? apiResult.id);
  if (!id || id <= 0) {
    throw new Error(`Failed to extract valid ID from API response: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
}

let accountA: { id: number; name: string };
let accountB: { id: number; name: string };
let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

test.describe('Transfer Linking: out_of_wallet <-> common_transfer', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });

    if (!dataSeeded) {
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

      const accA = await createAccount({
        request: page.request,
        name: 'Source Account',
        currencyCode: CURRENCY,
        initialBalance: 5000,
      });
      accountA = { id: extractId(accA), name: 'Source Account' };

      const accB = await createAccount({
        request: page.request,
        name: 'Destination Account',
        currencyCode: CURRENCY,
        initialBalance: 5000,
      });
      accountB = { id: extractId(accB), name: 'Destination Account' };

      // Create an out_of_wallet expense on account A
      await createTransaction({
        request: page.request,
        accountId: accountA.id,
        amount: 100,
        transactionType: 'expense',
        transferNature: 'transfer_out_wallet',
      });
      // Create a regular income on account B
      await createTransaction({
        request: page.request,
        accountId: accountB.id,
        amount: 100,
        transactionType: 'income',
      });

      dataSeeded = true;
    }
  });

  test('out_of_wallet transaction opens as transfer with Link button', async ({ page }) => {
    await page.goto(`/account/${accountA.id}`);

    // Wait for transaction list to load, then click the out_of_wallet transaction
    const txRecord = page.locator('[aria-haspopup="true"]').filter({ hasText: /out of wallet/i });
    await expect(txRecord.first()).toBeVisible({ timeout: 10_000 });
    await txRecord.first().click();

    // Dialog should open
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Verify it's in "Transfer" mode (transfer type selector button should be selected)
    const transferBtn = dialog.locator('button[aria-selected="true"]').filter({ hasText: /transfer/i });
    await expect(transferBtn).toBeVisible();

    // The "Link" button should be visible (not "Unlink")
    await expect(dialog.getByRole('button', { name: /link existing transaction/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /unlink/i })).not.toBeVisible();
  });

  test('links out_of_wallet expense to regular income via UI', async ({ page }) => {
    await page.goto(`/account/${accountA.id}`);

    // Click the out_of_wallet transaction
    const txRecord = page.locator('[aria-haspopup="true"]').filter({ hasText: /out of wallet/i });
    await expect(txRecord.first()).toBeVisible({ timeout: 10_000 });
    await txRecord.first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click the "Link" button to open the transaction picker
    await dialog.getByRole('button', { name: /link existing transaction/i }).click();

    // A nested dialog/picker should appear with available transactions
    // Wait for the picker content to load (it should show income transactions from other accounts)
    const pickerDialog = page.getByRole('dialog').last();
    await expect(pickerDialog).toBeVisible({ timeout: 10_000 });

    // Select the first available transaction record in the picker
    const availableTx = pickerDialog.locator('[aria-haspopup="true"]').first();
    await expect(availableTx).toBeVisible({ timeout: 10_000 });
    await availableTx.click();

    // The picker should close and the linked transaction should appear in the main dialog
    // Now the main dialog should show a Cancel button next to the linked transaction
    const mainDialog = page.getByRole('dialog').first();
    await expect(mainDialog.getByRole('button', { name: /cancel/i })).toBeVisible({ timeout: 5_000 });

    // Submit the form (button says "Edit" when editing existing transaction)
    await mainDialog.getByRole('button', { name: /edit transaction/i }).click();

    // Dialog should close after successful linking
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15_000 });
  });

  test('linked transaction shows Unlink button when re-opened', async ({ page }) => {
    await page.goto(`/account/${accountA.id}`);

    // The transaction should still be visible (now as common_transfer)
    // Click on it to re-open the dialog
    const txRecord = page.locator('[aria-haspopup="true"]').first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should now show "Unlink" button (since it's a common_transfer with opposite tx)
    await expect(dialog.getByRole('button', { name: /unlink/i })).toBeVisible({ timeout: 10_000 });

    // "Link" button should NOT be visible
    await expect(dialog.getByRole('button', { name: /link existing transaction/i })).not.toBeVisible();
  });

  test('unlinking common_transfer reverts both transactions', async ({ page }) => {
    await page.goto(`/account/${accountA.id}`);

    // Click the linked transaction
    const txRecord = page.locator('[aria-haspopup="true"]').first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click "Unlink"
    const unlinkBtn = dialog.getByRole('button', { name: /unlink/i });
    await expect(unlinkBtn).toBeVisible({ timeout: 10_000 });
    await unlinkBtn.click();

    // Dialog should close after successful unlinking
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15_000 });

    // Re-open the transaction — it should no longer be a transfer
    // Reload the page to get fresh data
    await page.goto(`/account/${accountA.id}`);

    const txRecordAfter = page.locator('[aria-haspopup="true"]').first();
    await expect(txRecordAfter).toBeVisible({ timeout: 10_000 });
    await txRecordAfter.click();

    const dialogAfter = page.getByRole('dialog');
    await expect(dialogAfter).toBeVisible({ timeout: 5_000 });

    // After unlinking, the transaction should be not_transfer (expense type).
    // The type selector should NOT show "Transfer" as selected.
    const transferSelected = dialogAfter.locator('button[aria-selected="true"]').filter({ hasText: /transfer/i });
    await expect(transferSelected).not.toBeVisible();

    // Neither Link nor Unlink buttons should be visible (it's a regular expense now)
    await expect(dialogAfter.getByRole('button', { name: /link existing transaction/i })).not.toBeVisible();
    await expect(dialogAfter.getByRole('button', { name: /unlink/i })).not.toBeVisible();
  });

  test('two out_of_wallet transactions can be linked via API and then unlinked via UI', async ({ page }) => {
    // Create a second out_of_wallet income on account B via API
    const txIncome = await createTransaction({
      request: page.request,
      accountId: accountB.id,
      amount: 50,
      transactionType: 'income',
      transferNature: 'transfer_out_wallet',
    });
    const outOfWalletIncomeId = extractId(txIncome);

    // Create a new out_of_wallet expense on account A
    const txExpense = await createTransaction({
      request: page.request,
      accountId: accountA.id,
      amount: 50,
      transactionType: 'expense',
      transferNature: 'transfer_out_wallet',
    });
    const outOfWalletExpenseId = extractId(txExpense);

    // Link them via API (both are out_of_wallet, should succeed)
    const linkResult = await linkTransactions({
      request: page.request,
      ids: [[outOfWalletExpenseId, outOfWalletIncomeId]],
    });

    const transferId = linkResult.response?.[0]?.[0]?.transferId;
    expect(transferId).toBeTruthy();

    // Now verify via UI that the linked transaction shows "Unlink"
    await page.goto(`/account/${accountA.id}`);

    // Find the linked transaction (50 amount)
    const txRecord = page.locator('[aria-haspopup="true"]').filter({ hasText: /50/ }).first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Should show Unlink (both were out_of_wallet, now common_transfer)
    await expect(dialog.getByRole('button', { name: /unlink/i })).toBeVisible({ timeout: 10_000 });

    // Unlink via UI
    await dialog.getByRole('button', { name: /unlink/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15_000 });
  });
});
