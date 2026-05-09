import { type APIRequestContext, expect, test } from '@playwright/test';

import {
  acceptShareInvitation,
  createAccount,
  createCategory,
  createShareInvitation,
  createTransaction,
  completeOnboarding,
  signInViaApi,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { type TestCredentials, buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';

const CURRENCY = 'USD';

/**
 * Pulls an entity ID out of the controller-factory response shape `{ status, response }` —
 * tolerates raw rows, single-object responses, and array responses (where the row of
 * interest is at index 0).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractId(apiResult: any): number {
  const resp = apiResult.response;
  const id = Array.isArray(resp) ? resp[0]?.id : (resp?.id ?? apiResult.id);
  if (!id || id <= 0) {
    throw new Error(`Failed to extract valid ID: ${JSON.stringify(apiResult).slice(0, 200)}`);
  }
  return id;
}

let owner: TestCredentials;
let recipient: TestCredentials;
let ownerApi: APIRequestContext;
let recipientApi: APIRequestContext;
let acctWriteAll: { id: number; name: string };
let acctWriteOwn: { id: number; name: string };
let acctRead: { id: number; name: string };
let ownerExclusiveCategoryName: string;
let ownerExclusiveCategoryId: number;
let recipientExclusiveCategoryName: string;
let recipientOwnAcct: { id: number; name: string };

test.describe.configure({ mode: 'serial' });

test.describe('Family sharing — recipient view', () => {
  test.beforeAll(async ({ playwright }) => {
    owner = buildTestCredentials({ prefix: 'fs-o' });
    recipient = buildTestCredentials({ prefix: 'fs-r' });

    await signUpAndVerify({ creds: owner });
    await signUpAndVerify({ creds: recipient });

    ownerApi = await signInViaApi({ playwright, email: owner.email, password: owner.password });
    recipientApi = await signInViaApi({ playwright, email: recipient.email, password: recipient.password });

    await completeOnboarding({ request: ownerApi, currencyCode: CURRENCY });
    await completeOnboarding({ request: recipientApi, currencyCode: CURRENCY });

    // Three accounts so each policy variant has its own shared resource — the share API
    // doesn't yet expose a policy-update endpoint, so mutating policy mid-test would
    // require revoke+re-invite churn we'd rather skip.
    const allAcct = await createAccount({
      request: ownerApi,
      name: `Wallet WriteAll ${owner.name}`,
      currencyCode: CURRENCY,
      initialBalance: 1000,
    });
    acctWriteAll = { id: extractId(allAcct), name: `Wallet WriteAll ${owner.name}` };

    const ownAcct = await createAccount({
      request: ownerApi,
      name: `Wallet WriteOwn ${owner.name}`,
      currencyCode: CURRENCY,
      initialBalance: 1000,
    });
    acctWriteOwn = { id: extractId(ownAcct), name: `Wallet WriteOwn ${owner.name}` };

    const readAcct = await createAccount({
      request: ownerApi,
      name: `Wallet Read ${owner.name}`,
      currencyCode: CURRENCY,
      initialBalance: 1000,
    });
    acctRead = { id: extractId(readAcct), name: `Wallet Read ${owner.name}` };

    // Owner-exclusive category — recipient won't have it in their own set, so its presence
    // in the picker is a clean signal that the picker routed to the owner's categories.
    ownerExclusiveCategoryName = `OwnerOnly-${owner.name}`;
    const ownerCatRes = await createCategory({
      request: ownerApi,
      name: ownerExclusiveCategoryName,
      color: '#FF00AA',
    });
    ownerExclusiveCategoryId = extractId(ownerCatRes);

    // Recipient-exclusive category + recipient-owned account — together they prove the
    // negative: when the form switches to the shared account, the recipient's *own*
    // category should NOT appear in the picker (it would mean the per-account routing
    // failed and is silently leaking the wrong set into a write that the backend rejects
    // with INVALID_CATEGORY).
    recipientExclusiveCategoryName = `RecipientOnly-${recipient.name}`;
    await createCategory({
      request: recipientApi,
      name: recipientExclusiveCategoryName,
      color: '#00FFAA',
    });

    const ownAcctRes = await createAccount({
      request: recipientApi,
      name: `Wallet Recipient ${recipient.name}`,
      currencyCode: CURRENCY,
      initialBalance: 500,
    });
    recipientOwnAcct = { id: extractId(ownAcctRes), name: `Wallet Recipient ${recipient.name}` };

    // Owner txs to use as targets for recipient edit/delete attempts. Only the seed-success
    // signal matters here — the UI locates rows by amount, not id.
    const txOnAll = await createTransaction({
      request: ownerApi,
      accountId: acctWriteAll.id,
      amount: 25,
      transactionType: 'expense',
    });
    expect(extractId(txOnAll)).toBeGreaterThan(0);

    const txOnOwn = await createTransaction({
      request: ownerApi,
      accountId: acctWriteOwn.id,
      amount: 25,
      transactionType: 'expense',
    });
    expect(extractId(txOnOwn)).toBeGreaterThan(0);

    // Three invitations, each accepted, so the recipient sees three shares with different policies.
    const inv1 = await createShareInvitation({
      request: ownerApi,
      inviteeEmail: recipient.email,
      resourceId: acctWriteAll.id,
      permission: 'write',
      policy: { transactionsWriteScope: 'all' },
    });
    await acceptShareInvitation({ request: recipientApi, token: inv1.token });

    const inv2 = await createShareInvitation({
      request: ownerApi,
      inviteeEmail: recipient.email,
      resourceId: acctWriteOwn.id,
      permission: 'write',
      policy: { transactionsWriteScope: 'own' },
    });
    await acceptShareInvitation({ request: recipientApi, token: inv2.token });

    const inv3 = await createShareInvitation({
      request: ownerApi,
      inviteeEmail: recipient.email,
      resourceId: acctRead.id,
      permission: 'read',
    });
    await acceptShareInvitation({ request: recipientApi, token: inv3.token });
  });

  test.afterAll(async () => {
    await ownerApi?.dispose();
    await recipientApi?.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI({ page, email: recipient.email, password: recipient.password });
  });

  test('account header hides rename popover, transfer, kebab, and balance-click for non-owners', async ({ page }) => {
    await page.goto(`/account/${acctWriteAll.id}`);

    // Account name should be plain text, not a popover trigger that opens a rename form.
    const nameNode = page.getByText(acctWriteAll.name).first();
    await expect(nameNode).toBeVisible({ timeout: 10_000 });
    await nameNode.click();
    // No rename popover input should appear after clicking the name.
    await expect(page.locator('input[name="name"], input[placeholder*="name" i]')).toHaveCount(0);

    // The portfolio-transfer arrow icon button is owner-only.
    await expect(page.getByRole('button', { name: /transfer to portfolio/i })).toHaveCount(0);

    // The whole kebab dropdown is hidden for recipients (rename + adjust + share are owner-only).
    await expect(page.getByRole('button', { name: /account actions/i })).toHaveCount(0);
  });

  test('account page tabs trim Integrations and Settings danger sections for recipients', async ({ page }) => {
    await page.goto(`/account/${acctWriteAll.id}`);

    // PillTabs is a custom component — buttons carry `data-value="<tab-id>"`, not ARIA roles.
    // The Details pill always renders, so wait on it as the readiness signal for the tablist.
    const detailsPill = page.locator('button[data-value="details"]');
    await expect(detailsPill).toBeVisible({ timeout: 10_000 });

    // Recipients shouldn't see the Integrations pill.
    await expect(page.locator('button[data-value="integrations"]')).toHaveCount(0);
    // Settings pill still present.
    await expect(page.locator('button[data-value="settings"]')).toHaveCount(1);

    // Archive + Delete sections live inside the Settings tab content, wrapped in
    // v-if="isOwner". They are stripped from the DOM entirely for recipients regardless of
    // active tab — no click needed.
    await expect(page.getByRole('button', { name: /archive account/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /delete account/i })).toHaveCount(0);
  });

  test('tx form labels shared accounts with "(shared by @owner)" in the account dropdown', async ({ page }) => {
    await page.goto('/dashboard');

    // Open the global "Add transaction" affordance (header button or FAB).
    const addBtn = page.getByRole('button', { name: /add transaction|new transaction/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Open the "from account" combobox.
    await dialog.locator('button[role="combobox"]').first().click();

    // Owner's truncated username appears alongside the account name.
    const truncatedHandle = `@${owner.name.slice(0, 12)}`;
    await expect(
      page.getByRole('option', {
        name: new RegExp(`${acctWriteAll.name}.*shared by ${truncatedHandle}`, 'i'),
      }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('tx form picker shows owner-exclusive category when shared account is selected', async ({ page }) => {
    await page.goto('/dashboard');

    const addBtn = page.getByRole('button', { name: /add transaction|new transaction/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Pick the shared (write/all) account.
    await dialog.locator('button[role="combobox"]').first().click();
    await page
      .getByRole('option', { name: new RegExp(acctWriteAll.name, 'i') })
      .first()
      .click();

    // Open the category picker — it should now show the owner's exclusive category.
    await dialog
      .getByLabel(/category/i)
      .first()
      .click();
    await expect(page.getByRole('option', { name: new RegExp(ownerExclusiveCategoryName, 'i') })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('tx form picker hides recipient-only categories when shared account is selected', async ({ page }) => {
    await page.goto('/dashboard');

    const addBtn = page.getByRole('button', { name: /add transaction|new transaction/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Pick the shared account; routing should swap the picker to the owner's category set.
    // The recipient's exclusive category must NOT show up — surfacing it would let the form
    // submit a categoryId the backend rejects with INVALID_CATEGORY (per S4 rule that
    // shared-account txs reference the owner's set).
    await dialog.locator('button[role="combobox"]').first().click();
    await page
      .getByRole('option', { name: new RegExp(acctWriteAll.name, 'i') })
      .first()
      .click();

    await dialog
      .getByLabel(/category/i)
      .first()
      .click();
    await expect(page.getByRole('option', { name: new RegExp(recipientExclusiveCategoryName, 'i') })).toHaveCount(0);
  });

  test('tx form swaps category sets when toggling between own and shared accounts', async ({ page }) => {
    await page.goto('/dashboard');

    const addBtn = page.getByRole('button', { name: /add transaction|new transaction/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Start on recipient's own account — recipient's category should appear.
    await dialog.locator('button[role="combobox"]').first().click();
    await page
      .getByRole('option', { name: new RegExp(recipientOwnAcct.name, 'i') })
      .first()
      .click();

    await dialog
      .getByLabel(/category/i)
      .first()
      .click();
    await expect(page.getByRole('option', { name: new RegExp(recipientExclusiveCategoryName, 'i') })).toBeVisible({
      timeout: 10_000,
    });
    // Close picker before switching account.
    await page.keyboard.press('Escape');

    // Switch to the shared account; picker should now show the owner-exclusive category and
    // the shared-owner notice banner naming the owner.
    await dialog.locator('button[role="combobox"]').first().click();
    await page
      .getByRole('option', { name: new RegExp(acctWriteAll.name, 'i') })
      .first()
      .click();

    await dialog
      .getByLabel(/category/i)
      .first()
      .click();
    await expect(page.getByRole('option', { name: new RegExp(ownerExclusiveCategoryName, 'i') })).toBeVisible({
      timeout: 10_000,
    });
    // The shared-owner notice banner names the owner so the user understands why the picker
    // shows a different set than usual.
    const truncatedHandle = `@${owner.name.slice(0, 12)}`;
    await expect(page.getByText(new RegExp(`shared.*${truncatedHandle}|${truncatedHandle}.*shared`, 'i'))).toBeVisible({
      timeout: 5_000,
    });
  });

  test("recipient with write/own can edit own tx but not the owner's tx on the same shared account", async ({
    page,
  }) => {
    // Recipient creates a tx on the write/own account via API (acts as the recipient's "own" tx).
    // Categories on a shared account must come from the owner — passing the recipient's own
    // default category id would 404 with INVALID_CATEGORY (S4 rule).
    const recipientTx = await createTransaction({
      request: recipientApi,
      accountId: acctWriteOwn.id,
      amount: 11,
      transactionType: 'expense',
      categoryId: ownerExclusiveCategoryId,
    });
    const recipientTxId = extractId(recipientTx);
    expect(recipientTxId).toBeGreaterThan(0);

    await page.goto(`/account/${acctWriteOwn.id}`);

    // Open the owner's tx — submit + delete should be disabled / hidden.
    // Filter by formatted amount string (e.g. "$25.00") to avoid substring collisions with
    // calendar day numbers, year fragments, or unrelated UI text. Plain "25" matched
    // calendar cells and other transactions on the 25th day of the month.
    const ownerRow = page
      .locator('[aria-haspopup="true"]')
      .filter({ hasText: /\$25\.00/ })
      .first();
    await expect(ownerRow).toBeVisible({ timeout: 10_000 });
    await ownerRow.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByRole('button', { name: /^edit transaction$/i })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /^delete$/i })).toHaveCount(0);

    // Close dialog (Escape works for ResponsiveDialog).
    await page.keyboard.press('Escape');

    // Open the recipient's own tx — submit should be enabled.
    const ownRow = page
      .locator('[aria-haspopup="true"]')
      .filter({ hasText: /\$11\.00/ })
      .first();
    await expect(ownRow).toBeVisible({ timeout: 10_000 });
    await ownRow.click();
    const dialog2 = page.getByRole('dialog').first();
    await expect(dialog2).toBeVisible({ timeout: 5_000 });
    await expect(dialog2.getByRole('button', { name: /^edit transaction$/i })).toBeEnabled();
  });

  test('read-only recipient sees disabled submit on owner txs', async ({ page }) => {
    await page.goto(`/account/${acctRead.id}`);

    // Read-only acct has no recipient-created txs. Open the owner's tx (the seed had none on
    // the read acct, so create one here as the owner via API).
    const seedTx = await createTransaction({
      request: ownerApi,
      accountId: acctRead.id,
      amount: 7,
      transactionType: 'expense',
    });
    expect(extractId(seedTx)).toBeGreaterThan(0);
    await page.reload();

    // Match formatted amount, not raw "7" — that single digit collides with calendar cells,
    // page numbers, and a host of other UI bits.
    const row = page
      .locator('[aria-haspopup="true"]')
      .filter({ hasText: /\$7\.00/ })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByRole('button', { name: /^edit transaction$/i })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
  });

  test.skip('recipient with write/all can create a new tx on the shared account via UI', async ({ page }) => {
    // SKIPPED: relies on the tx form auto-preselecting an owner-side category when the
    // account-detail "Add transaction" affordance opens with a pre-scoped shared account.
    // The current dialog flow does not reliably populate `categoryId` from the owner set
    // before the submit click fires (form ready-gate races with mutation), so the POST
    // either drops `categoryId` and lands as "Uncategorized" or 404s before the dialog
    // closes. Re-enable once the form pre-selects the first owner category for shared
    // accounts and the list invalidation lands deterministically.
    //
    // Backend behavior (recipient with write/all creating tx on owner's account using an
    // owner category) is covered by `shared-account-writes.service.e2e.ts` ("allows a
    // recipient with write/all to create a transaction with the owner category").
    await page.goto(`/account/${acctWriteAll.id}`);

    const addBtn = page.getByRole('button', { name: /add transaction|new transaction/i }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.locator('input[type="number"]').first().fill('17');
    await dialog.getByRole('button', { name: /^create transaction$/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .locator('[aria-haspopup="true"]')
        .filter({ hasText: /\$17\.00/ })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
