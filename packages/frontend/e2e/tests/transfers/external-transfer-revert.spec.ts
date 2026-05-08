import { test, expect } from '@playwright/test';

import { completeOnboarding, createAccount, createTransaction, linkTransactions } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'ext-rev' });

/** Extract entity ID from API response, handling several response shapes */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractId(apiResult: any): number {
  const resp = apiResult.response;
  const id = Array.isArray(resp) ? resp[0]?.id : (resp?.id ?? apiResult.id);
  if (!id || id <= 0) {
    throw new Error(`Failed to extract valid ID from API response: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
}

let externalAccount: { id: number; name: string };
let systemAccount: { id: number; name: string };
let dataSeeded = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await signUpAndVerify({ creds });
});

/**
 * Regression coverage for the "external income → transfer → revert" flow.
 *
 * Pre-fix bug:
 *   When opening a common_transfer where the *external* side is the income, the
 *   manage-transaction dialog was swapping `transaction`/`oppositeTransaction`
 *   so the system expense became the form's primary tx. Side effects:
 *     1. Both Income AND Expense tabs were enabled (system account allows both).
 *     2. Reverting "transfer → income" populated the form with the system
 *        expense's data, so the submit flipped the system expense into an income
 *        instead of just unlinking the original external income.
 */
test.describe('Manage transaction dialog: external transfer revert', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });

    if (!dataSeeded) {
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

      const ext = await createAccount({
        request: page.request,
        name: 'External Bank Account',
        currencyCode: CURRENCY,
        initialBalance: 5000,
        type: 'monobank',
      });
      externalAccount = { id: extractId(ext), name: 'External Bank Account' };

      const sys = await createAccount({
        request: page.request,
        name: 'System Wallet',
        currencyCode: CURRENCY,
        initialBalance: 5000,
      });
      systemAccount = { id: extractId(sys), name: 'System Wallet' };

      dataSeeded = true;
    }
  });

  /** Seeds a fresh external income linked as a transfer to a system expense and returns the external income id. */
  async function seedExternalIncomeTransfer({
    request,
    amount,
  }: {
    request: import('@playwright/test').APIRequestContext;
    amount: number;
  }): Promise<{ externalIncomeId: number; systemExpenseId: number }> {
    const incomeRes = await createTransaction({
      request,
      accountId: externalAccount.id,
      amount,
      transactionType: 'income',
    });
    const externalIncomeId = extractId(incomeRes);

    const expenseRes = await createTransaction({
      request,
      accountId: systemAccount.id,
      amount,
      transactionType: 'expense',
    });
    const systemExpenseId = extractId(expenseRes);

    await linkTransactions({
      request,
      ids: [[externalIncomeId, systemExpenseId]],
    });

    return { externalIncomeId, systemExpenseId };
  }

  test('locks the type tabs to the original income type for an external income transfer', async ({ page }) => {
    const amount = 142;
    await seedExternalIncomeTransfer({ request: page.request, amount });

    await page.goto(`/account/${externalAccount.id}`);

    // Open the external income tx
    const txRecord = page.locator('[aria-haspopup="true"]').first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The tx is a common_transfer, so Transfer tab should be selected initially.
    const transferTab = dialog.getByRole('button', { name: /select transfer/i });
    const incomeTab = dialog.getByRole('button', { name: /select income/i });
    const expenseTab = dialog.getByRole('button', { name: /select expense/i });

    await expect(transferTab).toHaveAttribute('aria-selected', 'true');

    // Wait for form-loading to finish — until then ALL tabs are disabled. Once income
    // becomes enabled we know per-tab disable logic has taken over.
    await expect(incomeTab).toBeEnabled();
    await expect(transferTab).toBeEnabled();

    // Bug-guard: original tx was income on an external account, so expense MUST stay disabled.
    await expect(expenseTab).toBeDisabled();
  });

  test('locks the type tabs to the original expense type for an external expense transfer', async ({ page }) => {
    // Symmetric case — should already work pre-fix, but pinning it down so the
    // normalization change doesn't regress it.
    const amount = 73;

    const expenseRes = await createTransaction({
      request: page.request,
      accountId: externalAccount.id,
      amount,
      transactionType: 'expense',
    });
    const externalExpenseId = extractId(expenseRes);

    const incomeRes = await createTransaction({
      request: page.request,
      accountId: systemAccount.id,
      amount,
      transactionType: 'income',
    });
    const systemIncomeId = extractId(incomeRes);

    await linkTransactions({
      request: page.request,
      ids: [[externalExpenseId, systemIncomeId]],
    });

    await page.goto(`/account/${externalAccount.id}`);

    // Filter to find this specific expense tx (avoid picking up the income from the previous test)
    const txRecord = page
      .locator('[aria-haspopup="true"]')
      .filter({ hasText: String(amount) })
      .first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const incomeTab = dialog.getByRole('button', { name: /select income/i });
    const expenseTab = dialog.getByRole('button', { name: /select expense/i });

    // Wait for form-loading to finish — until then ALL tabs are disabled.
    await expect(expenseTab).toBeEnabled();
    await expect(incomeTab).toBeDisabled();
  });

  test('reverting transfer → income keeps the external income intact and the system expense as expense', async ({
    page,
  }) => {
    const amount = 211;
    const { externalIncomeId, systemExpenseId } = await seedExternalIncomeTransfer({
      request: page.request,
      amount,
    });

    await page.goto(`/account/${externalAccount.id}`);

    // Open the external income tx
    const txRecord = page
      .locator('[aria-haspopup="true"]')
      .filter({ hasText: String(amount) })
      .first();
    await expect(txRecord).toBeVisible({ timeout: 10_000 });
    await txRecord.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for form to finish loading (income tab enabled signals tabs are interactive).
    const incomeTab = dialog.getByRole('button', { name: /select income/i });
    await expect(incomeTab).toBeEnabled();

    // Switch back to Income — submit the revert.
    await incomeTab.click();
    await dialog.getByRole('button', { name: /edit transaction/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // Verify backend state via API:
    // - external income should be back to a regular not_transfer income
    // - system expense should be unlinked but still expense (NOT income)
    const externalRes = await page.request.get(`https://localhost:8081/api/v1/transactions/${externalIncomeId}`);
    expect(externalRes.ok()).toBeTruthy();
    const externalBody = await externalRes.json();
    const externalTx = externalBody.response ?? externalBody;
    expect(externalTx.transactionType).toBe('income');
    expect(externalTx.transferNature).toBe('not_transfer');
    expect(externalTx.transferId).toBeFalsy();

    const systemRes = await page.request.get(`https://localhost:8081/api/v1/transactions/${systemExpenseId}`);
    expect(systemRes.ok()).toBeTruthy();
    const systemBody = await systemRes.json();
    const systemTx = systemBody.response ?? systemBody;
    // The pre-fix bug flipped this to "income" — that's exactly what we're guarding against.
    expect(systemTx.transactionType).toBe('expense');
    expect(systemTx.transferNature).toBe('not_transfer');
    expect(systemTx.transferId).toBeFalsy();
  });
});
