import { expect, test } from '@playwright/test';

import {
  API_BASE_URL,
  completeOnboarding,
  createAccount,
  createCategory,
  extractId,
  signInViaApi,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';
import { waitForSuccessToast } from '../../helpers/ui';

const CURRENCY = 'USD';
const creds = buildTestCredentials({ prefix: 'tpl' });

const ACCOUNT_NAME = 'Templates Wallet';
const CATEGORY_NAME = 'Template Coffee';
const TEMPLATE_NAME = 'Coffee run';
const NOTE = 'Coffee beans';
const AMOUNT = 42.5;

test.describe('Transaction templates: save from form, apply, create transaction', () => {
  test.beforeAll(async () => {
    await signUpAndVerify({ creds });
  });

  test('full journey: create template from form, apply it, save the transaction', async ({ page, playwright }) => {
    // Seed everything BEFORE the app first loads: the categories query persists with
    // staleTime: Infinity, so data created after the first page load never reaches the picker.
    const api = await signInViaApi({ playwright, email: creds.email, password: creds.password });
    await completeOnboarding({ request: api, currencyCode: CURRENCY });
    const accountRes = await createAccount({
      request: api,
      name: ACCOUNT_NAME,
      currencyCode: CURRENCY,
      initialBalance: 1000,
    });
    const accountId = extractId(accountRes);
    const categoryRes = await createCategory({ request: api, name: CATEGORY_NAME, color: '#8f5b34' });
    const categoryId = extractId(categoryRes);

    await loginViaUI({ page, email: creds.email, password: creds.password });
    await page.goto('/dashboard');

    // Two dialogs stack during the flow (transaction form + template editor), so scope
    // each by a button unique to it.
    const txDialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Create transaction' }) });
    const templateDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: 'Save template' }) });
    const amountInput = txDialog.locator('input[type="number"]').first();
    const accountSelect = txDialog.getByRole('combobox').first();
    const categoryTrigger = txDialog.getByRole('button', { name: 'Select category' });
    const noteInput = txDialog.locator('textarea');
    const templatesTrigger = txDialog.getByRole('button', { name: 'Templates' });

    const openTransactionDialog = async () => {
      await page.getByRole('button', { name: 'Add transaction' }).click();
      await expect(txDialog).toBeVisible();
    };

    // ── 1. Fill the form and save it as a template ──────────────────────
    await openTransactionDialog();

    await amountInput.fill(String(AMOUNT));
    await accountSelect.click();
    await page.getByRole('option', { name: ACCOUNT_NAME }).click();
    await categoryTrigger.click();
    await page.getByLabel('Search category').fill(CATEGORY_NAME);
    await page.getByRole('option', { name: CATEGORY_NAME }).click();
    await noteInput.fill(NOTE);

    await expect(templatesTrigger).toBeEnabled();
    await templatesTrigger.click();
    await page.getByRole('button', { name: 'Save current as template' }).click();

    await expect(templateDialog).toBeVisible();
    await templateDialog.getByLabel('Name').fill(TEMPLATE_NAME);
    await templateDialog.getByRole('button', { name: 'Save template' }).click();

    await waitForSuccessToast({ page });
    await expect(templateDialog).not.toBeVisible();
    // Saving from the form adopts the template — the trigger pill now carries its name.
    await expect(txDialog.getByRole('button', { name: TEMPLATE_NAME })).toBeVisible();

    // Leave without creating a transaction so the apply step starts from a blank form.
    await page.keyboard.press('Escape');
    await expect(txDialog).not.toBeVisible();

    // ── 2. Apply the template onto a fresh form ─────────────────────────
    await openTransactionDialog();
    await expect(amountInput).toHaveValue('');

    await expect(templatesTrigger).toBeEnabled();
    await templatesTrigger.click();
    await page.getByRole('option', { name: TEMPLATE_NAME }).click();

    await expect(txDialog.getByRole('button', { name: TEMPLATE_NAME })).toBeVisible();
    await expect(amountInput).toHaveValue(String(AMOUNT));
    await expect(accountSelect).toContainText(ACCOUNT_NAME);
    await expect(categoryTrigger).toContainText(CATEGORY_NAME);
    await expect(noteInput).toHaveValue(NOTE);

    // ── 3. Save the transaction and verify it via the API ───────────────
    await txDialog.getByRole('button', { name: 'Create transaction' }).click();
    await expect(txDialog).not.toBeVisible({ timeout: 10_000 });

    const listRes = await page.request.get(`${API_BASE_URL}/api/v1/transactions?limit=20`);
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    const transactions: Array<Record<string, unknown>> = listBody.response ?? listBody;

    const created = transactions.find((tx) => tx.note === NOTE);
    expect(created, 'transaction created from the template should exist').toBeTruthy();
    expect(Number(created!.amount)).toBe(AMOUNT);
    expect(created!.transactionType).toBe('expense');
    expect(String(created!.accountId)).toBe(accountId);
    expect(String(created!.categoryId)).toBe(categoryId);
  });
});
