import { expect, test } from '@playwright/test';

import {
  completeOnboarding,
  createAccount,
  createTransaction,
  createVentureDeal,
  createVentureEvent,
  createVenturePlatform,
  extractId,
  getVentureDeal,
  signInViaApi,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'https://localhost:8081';

test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────────────────
// Test 1 — Write-off lifecycle (PRD scenario 2)
// ─────────────────────────────────────────────────────────────────────

test.describe('Venture Write-off Lifecycle — PRD scenario 2', () => {
  const creds = buildTestCredentials({ prefix: 'vwo' });
  let request: Awaited<ReturnType<typeof signInViaApi>>;
  let dealId: string;
  let accountId: string;

  test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }) => {
    await signUpAndVerify({ creds });
    request = await signInViaApi({ playwright, email: creds.email, password: creds.password });
    await completeOnboarding({ request, currencyCode: CURRENCY });

    const account = await createAccount({
      request,
      name: 'USD Bank',
      currencyCode: CURRENCY,
      initialBalance: 50000,
    });
    accountId = extractId(account);

    const platform = await createVenturePlatform({
      request,
      payload: {
        name: 'Acme Ventures',
        defaultEntryFeePct: '0.085',
        defaultCarryPct: '0.2',
        defaultHurdlePct: '0',
      },
    });

    const deal = await createVentureDeal({
      request,
      payload: {
        name: 'Failed Startup SPV',
        currencyCode: CURRENCY,
        principal: '16000',
        investmentDate: '2026-03-24',
        platformId: extractId(platform),
      },
    });
    dealId = extractId(deal);

    const initialTx = await createTransaction({
      request,
      accountId,
      amount: 17360,
      transactionType: 'expense',
    });
    await createVentureEvent({
      request,
      dealId,
      payload: {
        type: 'initial_investment',
        eventDate: '2026-03-24',
        cashFlowMode: 'linked',
        transactionIds: [extractId(initialTx)],
      },
    });
  });

  test('declining NAVs followed by writedown → status=written_off', async ({ page }) => {
    await createVentureEvent({
      request,
      dealId,
      payload: { type: 'nav_update', eventDate: '2027-03-24', cashFlowMode: 'none', navAfter: '10000' },
    });
    await createVentureEvent({
      request,
      dealId,
      payload: { type: 'writedown', eventDate: '2028-03-24', cashFlowMode: 'none', navAfter: '0' },
    });

    const deal = await getVentureDeal({ request, dealId });
    expect(deal.response.status).toBe('written_off');

    await loginViaUI({ page, email: creds.email, password: creds.password });
    await page.goto(`/venture/deals/${dealId}`);
    await page.waitForURL(/\/venture\/deals\//, { timeout: 15_000 });
    await expect(page.locator('text=/written.off/i').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 2 — Out-of-wallet UI flow (PRD scenario 4)
// ─────────────────────────────────────────────────────────────────────

test.describe('Venture Out-of-wallet event — UI flow', () => {
  const creds = buildTestCredentials({ prefix: 'voow' });
  let request: Awaited<ReturnType<typeof signInViaApi>>;
  let dealId: string;

  test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }) => {
    await signUpAndVerify({ creds });
    request = await signInViaApi({ playwright, email: creds.email, password: creds.password });
    await completeOnboarding({ request, currencyCode: CURRENCY });

    const deal = await createVentureDeal({
      request,
      payload: {
        name: 'Historical SPV',
        currencyCode: CURRENCY,
        principal: '5000',
        investmentDate: '2025-01-01',
        entryFeePct: '0',
      },
    });
    dealId = extractId(deal);
  });

  test('save fee_payment with cashFlowMode=out_of_wallet → timeline shows badge', async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await page.goto(`/venture/deals/${dealId}`);
    await page.waitForURL(/\/venture\/deals\//, { timeout: 15_000 });

    await page.getByRole('button', { name: /add event/i }).click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();

    // Combobox 0 = event type
    const comboboxes = dialog.locator('[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: /^fee payment$/i }).click();

    // Gross amount (first number input)
    await dialog.locator('input[type="number"]').first().fill('500');

    // Combobox 1 = cash flow mode (default = out_of_wallet, but click to be explicit)
    await comboboxes.nth(1).click();
    await page.getByRole('option', { name: /out of wallet/i }).click();

    const createResp = page.waitForResponse(
      (r) => /\/venture\/deals\/.+\/events/.test(r.url()) && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: /^create$/i }).click();
    const resp = await createResp;
    expect(resp.status()).toBe(200);

    // Timeline row carries the badge
    await expect(page.getByText(/out of wallet/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 3 — Multi-tx picker UI flow (PRD scenario 5)
// ─────────────────────────────────────────────────────────────────────

test.describe('Venture multi-tx picker — UI flow', () => {
  const creds = buildTestCredentials({ prefix: 'vmtp' });
  let request: Awaited<ReturnType<typeof signInViaApi>>;
  let dealId: string;

  test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }) => {
    await signUpAndVerify({ creds });
    request = await signInViaApi({ playwright, email: creds.email, password: creds.password });
    await completeOnboarding({ request, currencyCode: CURRENCY });

    const account = await createAccount({
      request,
      name: 'USD Bank',
      currencyCode: CURRENCY,
      initialBalance: 50000,
    });
    const accountId = extractId(account);

    const deal = await createVentureDeal({
      request,
      payload: {
        name: 'Split-funded SPV',
        currencyCode: CURRENCY,
        principal: '16000',
        investmentDate: '2026-03-24',
        entryFeePct: '0.085',
      },
    });
    dealId = extractId(deal);

    // Two expense txs of distinct, easily-spotted amounts.
    await createTransaction({ request, accountId, amount: 10000, transactionType: 'expense' });
    await createTransaction({ request, accountId, amount: 7360, transactionType: 'expense' });
  });

  test('pick 2 txs via picker, running sum updates, event saves with 2 links', async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await page.goto(`/venture/deals/${dealId}`);
    await page.waitForURL(/\/venture\/deals\//, { timeout: 15_000 });

    await page.getByRole('button', { name: /add event/i }).click();
    const eventDialog = page.getByRole('dialog').last();
    await expect(eventDialog).toBeVisible();

    const comboboxes = eventDialog.locator('[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option', { name: /^fee payment$/i }).click();

    await eventDialog.locator('input[type="number"]').first().fill('17360');

    await comboboxes.nth(1).click();
    await page.getByRole('option', { name: /link to existing/i }).click();

    // Pick first tx ($10,000)
    await eventDialog.getByRole('button', { name: /pick a transaction/i }).click();
    const picker1 = page.getByRole('dialog').last();
    await expect(picker1).toBeVisible();
    await picker1
      .getByText(/10[,.]?000/)
      .first()
      .click();

    // Summary reflects 1 linked
    await expect(eventDialog.getByText(/across 1 transaction/i)).toBeVisible({ timeout: 5_000 });

    // Pick second tx ($7,360)
    await eventDialog.getByRole('button', { name: /add another transaction/i }).click();
    const picker2 = page.getByRole('dialog').last();
    await expect(picker2).toBeVisible();
    await picker2
      .getByText(/7[,.]?360/)
      .first()
      .click();

    await expect(eventDialog.getByText(/across 2 transaction/i)).toBeVisible({ timeout: 5_000 });

    const createResp = page.waitForResponse(
      (r) => /\/venture\/deals\/.+\/events/.test(r.url()) && r.request().method() === 'POST',
    );
    await eventDialog.getByRole('button', { name: /^create$/i }).click();
    const resp = await createResp;
    expect(resp.status()).toBe(200);

    // Verify via API: the event has 2 links
    const eventsResp = await request.get(`${API_BASE_URL}/api/v1/venture/deals/${dealId}/events`);
    expect(eventsResp.ok()).toBeTruthy();
    const events = (await eventsResp.json()).response as Array<{
      type: string;
      links?: unknown[];
    }>;
    const feeEvent = events.find((e) => e.type === 'fee_payment');
    expect(feeEvent, 'fee_payment event should be persisted').toBeDefined();
    expect(feeEvent!.links?.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Test 4 — Delete event w/ "also delete tx" toggle
// ─────────────────────────────────────────────────────────────────────

test.describe('Venture event delete — also delete linked tx', () => {
  const creds = buildTestCredentials({ prefix: 'vedt' });
  let request: Awaited<ReturnType<typeof signInViaApi>>;
  let dealId: string;
  let txId: string;

  test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000, navigationTimeout: 30_000 });

  test.beforeAll(async ({ playwright }) => {
    await signUpAndVerify({ creds });
    request = await signInViaApi({ playwright, email: creds.email, password: creds.password });
    await completeOnboarding({ request, currencyCode: CURRENCY });

    const account = await createAccount({
      request,
      name: 'USD Bank',
      currencyCode: CURRENCY,
      initialBalance: 50000,
    });
    const accountId = extractId(account);

    const deal = await createVentureDeal({
      request,
      payload: {
        name: 'Delete-cascade SPV',
        currencyCode: CURRENCY,
        principal: '5000',
        investmentDate: '2026-03-24',
        entryFeePct: '0',
      },
    });
    dealId = extractId(deal);

    const tx = await createTransaction({
      request,
      accountId,
      amount: 5000,
      transactionType: 'expense',
    });
    txId = extractId(tx);

    await createVentureEvent({
      request,
      dealId,
      payload: {
        type: 'initial_investment',
        eventDate: '2026-03-24',
        cashFlowMode: 'linked',
        transactionIds: [txId],
      },
    });
  });

  test('delete event with toggle on → linked tx also deleted', async ({ page }) => {
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await page.goto(`/venture/deals/${dealId}`);
    await page.waitForURL(/\/venture\/deals\//, { timeout: 15_000 });

    // Click the event row's trash button
    await page
      .getByRole('button', { name: /delete event/i })
      .first()
      .click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();

    // Checkbox is only rendered when the event has linked tx — assert + toggle.
    // The project's Checkbox uses reka-ui, which renders as <button role="checkbox">.
    const checkbox = confirm.getByRole('checkbox');
    await expect(checkbox).toBeVisible();
    await checkbox.click();

    const deleteResp = page.waitForResponse(
      (r) => /\/venture\/events\/[^/]+/.test(r.url()) && r.request().method() === 'DELETE',
    );
    await confirm.getByRole('button', { name: /^delete event$/i }).click();
    const resp = await deleteResp;
    expect(resp.ok()).toBeTruthy();
    // Sanity: the toggle must have produced a query param so the backend deletes the tx too.
    expect(resp.url()).toContain('deleteLinkedTransactions=true');

    // The linked tx should be gone — endpoint returns 200 with `response: null` for missing txs.
    const txResp = await request.get(`${API_BASE_URL}/api/v1/transactions/${txId}`);
    expect(txResp.ok()).toBeTruthy();
    const body = await txResp.json();
    expect(body.response).toBeNull();
  });
});
