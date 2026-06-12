import { expect, test, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { API_BASE_URL, completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify, type TestCredentials } from '../../helpers/test-setup';

const specDir = path.dirname(fileURLToPath(import.meta.url));

// Single-sourced from the backend fixture so the frontend e2e walks the exact
// same CSV the backend e2e exercises. Resolved at import time so a missing
// fixture fails loudly before the test starts spinning up the wizard.
const FIXTURE_PATH = path.resolve(
  specDir,
  '../../../../backend/src/tests/fixtures/ynab-import/register-comprehensive.csv',
);

// Worst-case the comprehensive fixture took ~7.5s in the backend e2e; allow
// 60s headroom for browser bootstrap + SSE roundtrip + cache invalidation
// before declaring the import hung.
const IMPORT_DONE_TIMEOUT_MS = 60_000;

test.describe.configure({ mode: 'serial' });

test.describe('YNAB import wizard', () => {
  test.use({
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
  });

  test('uploads the comprehensive fixture and reaches the done screen with a non-zero summary', async ({ page }) => {
    const creds = await freshUser({ prefix: 'ynab-base' });
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await completeOnboarding({ request: page.request, currencyCode: 'USD' });

    const fixtureBuffer = await fs.readFile(FIXTURE_PATH);

    await page.goto('/settings/data-management/import/ynab');
    await page.waitForURL(/\/data-management\/import\/ynab/, { timeout: 15_000 });

    await expectStep1Active({ page });

    // Hand the fixture to the dropzone's hidden <input type="file"> directly —
    // the dropzone overlay (a styled <label>) covers it and is decorative.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'register-comprehensive.csv',
      mimeType: 'text/csv',
      buffer: fixtureBuffer,
    });

    await page.getByRole('button', { name: 'Continue' }).click();

    await expectStep2Active({ page });
    // Preview must list all 6 accounts before we proceed; the wizard seeds
    // each pick with the auto-detected currency, so canExecute should be true
    // immediately.
    await expect(page.getByText('Main PLN (PLN) – 8437')).toBeVisible();
    await expect(page.getByText('USD Main (USD) – 0504')).toBeVisible();
    await expect(page.getByText('EUR Main (EUR) – 2302')).toBeVisible();

    const startImportButton = page.getByRole('button', { name: 'Start import' });
    await expect(startImportButton).toBeEnabled();
    await startImportButton.click();

    // Wait for the done screen's success header to confirm the worker
    // finished and SSE/polling caught the terminal event.
    await expect(page.getByText('Import complete')).toBeVisible({ timeout: IMPORT_DONE_TIMEOUT_MS });

    // 6 accounts in fixture → 6 accounts created.
    await expect(summaryTile({ page, label: 'Accounts created' })).toContainText('6');
    // Every flag color appears at least once in the fixture → 6 YNAB-* tags.
    await expect(summaryTile({ page, label: 'Tags created' })).toContainText('6');

    // "View transactions" jumps to /transactions; the SSE listener invalidates
    // the TanStack cache on done so the page should render the just-imported
    // rows without manual refetch.
    await page.getByRole('button', { name: 'View transactions' }).click();
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });

    // Don't assert on the exact rendered row count — the fixture has 165+
    // ordinary tx rows and the transactions table virtualizes/paginates. Just
    // confirm at least one transaction row materialized.
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

    // The 6 YNAB flag tags must exist in the user's tag library. Hit the API
    // origin directly — page.request defaults to the FE baseURL, which would
    // serve the SPA index.html instead of the JSON payload.
    const tagsResponse = await page.request.get(`${API_BASE_URL}/api/v1/tags`);
    expect(tagsResponse.ok()).toBeTruthy();
    const tagsBody = await tagsResponse.json();
    const tagNames = (tagsBody.response ?? tagsBody).map((t: { name: string }) => t.name);
    for (const color of ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']) {
      expect(tagNames).toContain(`YNAB ${color}`);
    }
  });

  test('shows a destructive callout when the CSV is missing required YNAB columns', async ({ page }) => {
    const creds = await freshUser({ prefix: 'ynab-bad' });
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await completeOnboarding({ request: page.request, currencyCode: 'USD' });

    // Headers that look CSV-shaped but are missing every required YNAB column.
    // The parser must reject these at the validation stage (HTTP 422) instead
    // of silently degrading into an empty import.
    const malformed = '"Foo","Bar","Baz"\n"1","2","3"\n';

    await page.goto('/settings/data-management/import/ynab');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-a-ynab-export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(malformed, 'utf-8'),
    });
    await page.getByRole('button', { name: 'Continue' }).click();

    // The parser's own message references the missing column list verbatim
    // ("missing required column(s): Account, ..."), and the store surfaces it
    // via the destructive Callout under the dropzone.
    await expect(page.getByText(/missing required column/i)).toBeVisible({ timeout: 10_000 });

    // Critically, the wizard must stay on step 1 — no preview, no execute.
    // The "Start over" button only renders inside the active PreviewStep slot.
    await expect(page.getByRole('button', { name: 'Start over' })).not.toBeVisible();
  });

  test('"Start over" from the preview step drops uploaded state and returns to step 1', async ({ page }) => {
    const creds = await freshUser({ prefix: 'ynab-reset' });
    await loginViaUI({ page, email: creds.email, password: creds.password });
    await completeOnboarding({ request: page.request, currencyCode: 'USD' });

    const fixtureBuffer = await fs.readFile(FIXTURE_PATH);
    await page.goto('/settings/data-management/import/ynab');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'register-comprehensive.csv',
      mimeType: 'text/csv',
      buffer: fixtureBuffer,
    });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expectStep2Active({ page });

    await page.getByRole('button', { name: 'Start over' }).click();

    // After reset, step 2 collapses and the dropzone re-mounts. The "Start
    // over" button (which only lives inside PreviewStep) must be gone and the
    // dropzone's primary "Continue" button is hidden (no file selected → no
    // button).
    await expect(page.getByRole('button', { name: 'Start over' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });
});

// Helpers ----------------------------------------------------------------

async function freshUser({ prefix }: { prefix: string }): Promise<TestCredentials> {
  const creds = buildTestCredentials({ prefix });
  await signUpAndVerify({ creds });
  return creds;
}

async function expectStep1Active({ page }: { page: Page }) {
  await expect(page.locator('input[type="file"]')).toBeAttached();
}

async function expectStep2Active({ page }: { page: Page }) {
  // YnabStepShell renders every step's title h3 unconditionally, so a heading
  // match isn't a reliable step-2 indicator. The PreviewStep slot owns the
  // "Start over" button, which only mounts when step 2 is the active step.
  await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible({ timeout: 15_000 });
}

function summaryTile({ page, label }: { page: Page; label: string }) {
  // Each SummaryStat is a div containing the label text and a separate value.
  // Filter to the closest one so we don't grab the grid container.
  return page.locator('div', { has: page.getByText(label, { exact: true }) }).first();
}
