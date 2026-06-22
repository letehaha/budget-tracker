import type { YnabImportProgress } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { asUser, signUpSecondUser } from '@tests/helpers/share';

// ---------------------------------------------------------------------------
// Polling helper — the BullMQ worker is async: the execute response only carries
// `jobId`, so callers poll the status endpoint until the job reaches a terminal
// state. Mirrors the wallet importer's waitForWalletCompletion.
// ---------------------------------------------------------------------------

async function waitForCompletion({
  jobId,
  timeoutMs = 30_000,
}: {
  jobId: string;
  timeoutMs?: number;
}): Promise<YnabImportProgress> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const progress = await helpers.getYnabImportStatus({ jobId, raw: true });
    if (progress.status === 'completed' || progress.status === 'failed') {
      return progress;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`YNAB import job ${jobId} did not finish within ${timeoutMs}ms`);
}

/** Narrow a terminal-state progress to the `completed` branch so tests can
 *  reach `summary` without a non-null assertion. Throws (and fails the test)
 *  if the worker actually failed. */
function expectCompleted(
  progress: YnabImportProgress,
): asserts progress is Extract<YnabImportProgress, { status: 'completed' }> {
  if (progress.status !== 'completed') {
    throw new Error(`Expected completed import, got status="${progress.status}".`);
  }
}

describe('Execute YNAB import endpoint', () => {
  it('imports a multi-currency fixture end to end and persists every entity', async () => {
    const fileContent = helpers.loadYnabFixture('register-basic.csv');

    // Parse once just to capture the YNAB account names — they are the keys
    // the wizard wires the per-account currency picker against.
    const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });
    const usdName = parsed.result.accounts.find((a) => a.detectedCurrency === 'USD')!.originalName;
    const eurName = parsed.result.accounts.find((a) => a.detectedCurrency === 'EUR')!.originalName;
    const plnName = parsed.result.accounts.find((a) => a.detectedCurrency === 'PLN')!.originalName;

    const { jobId } = await helpers.executeYnab({
      payload: {
        fileContent,
        accountMapping: {
          [usdName]: { currencyCode: 'USD' },
          [eurName]: { currencyCode: 'EUR' },
          [plnName]: { currencyCode: 'PLN' },
        },
      },
      raw: true,
    });

    const progress = await waitForCompletion({ jobId });
    expectCompleted(progress);
    const summary = progress.summary;

    expect(summary.accountsCreated).toBe(3);
    // 4 unique payees from the fixture: Acme Corp, Coffee Shop, Employer Inc, Carrefour.
    expect(summary.payeesCreated).toBe(4);
    // 4 flag colors used (red, yellow, blue, green) → 4 tags.
    expect(summary.tagsCreated).toBe(4);
    // Fixture has 4 ordinary rows (Acme + Coffee + Employer + Carrefour) plus
    // one transfer (two CSV legs collapsed into a single linked pair).
    expect(summary.transactionsImported).toBe(4);
    expect(summary.transfersImported).toBe(1);
    expect(summary.errors).toHaveLength(0);

    // Assert the DB caught up via the regular APIs the wizard's "what just
    // happened?" screen will hit.
    const accountsAfter = await helpers.getAccounts();
    const importedAccountNames = accountsAfter.map((a) => a.name);
    expect(importedAccountNames).toEqual(expect.arrayContaining([usdName, eurName, plnName]));

    const usdAccount = accountsAfter.find((a) => a.name === usdName)!;
    expect(usdAccount.currencyCode).toBe('USD');
    // Starting balance of $1500 came from the synthetic "Starting Balance" row
    // and is applied as initialBalance, NOT as a transaction. API responses
    // serialize Money as plain decimals.
    expect(Number(usdAccount.initialBalance)).toBe(1500);

    const transactionsAfter = await helpers.getTransactions({ raw: true });
    const salary = transactionsAfter.find((t) => t.note === 'Salary');
    expect(salary).toBeDefined();
    expect(salary!.transactionType).toBe('income');
    expect(Number(salary!.amount)).toBe(3200);

    const electric = transactionsAfter.find((t) => t.note === 'Electric bill');
    expect(electric).toBeDefined();
    expect(electric!.transactionType).toBe('expense');
    expect(Number(electric!.amount)).toBe(120.5);
  });

  it('imports the comprehensive multi-account, multi-flag fixture without losing rows', async () => {
    const fileContent = helpers.loadYnabFixture('register-comprehensive.csv');

    const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });

    // Fixture has 6 accounts across 3 currencies — both auto-detected
    // currencies and the (CCY) – last4 naming convention must round-trip.
    expect(parsed.result.accounts).toHaveLength(6);
    const currencies = parsed.result.accounts.map((a) => a.detectedCurrency).toSorted();
    expect(currencies).toEqual(['EUR', 'EUR', 'PLN', 'PLN', 'USD', 'USD']);

    // All 6 YNAB flag colors appear at least once so we exercise tag
    // creation for every color.
    const tagColors = parsed.result.tagsUsed.map((t) => t.color).toSorted();
    expect(tagColors).toEqual(['blue', 'green', 'orange', 'purple', 'red', 'yellow']);

    // Account mapping must cover every distinct YNAB account.
    const accountMapping = Object.fromEntries(
      parsed.result.accounts.map((a) => [a.originalName, { currencyCode: a.detectedCurrency! }]),
    );

    const { jobId } = await helpers.executeYnab({
      payload: { fileContent, accountMapping },
      raw: true,
    });

    // The comprehensive fixture is large (~170 rows); give the worker more
    // headroom than the small fixture before we declare it stuck.
    const progress = await waitForCompletion({ jobId, timeoutMs: 60_000 });
    expectCompleted(progress);
    const summary = progress.summary;

    expect(summary.accountsCreated).toBe(6);
    // Every transaction in the comprehensive fixture must land or surface as
    // an error — no silent drops.
    expect(summary.transactionsImported + summary.errors.length).toBe(parsed.result.transactions.length);
    // Sanity check: most rows should succeed. If we ever drop more than 5,
    // the executor's per-row error handling has regressed and we want to know.
    expect(summary.errors.length).toBeLessThan(5);
    // Tag-per-flag-color: 6 tags created.
    expect(summary.tagsCreated).toBe(6);
    // 4 category groups in the fixture (Bills, Needs, Wants — Inflow is the
    // skipped pseudo-group) + 1 child per unique "Group: Category" combo.
    expect(summary.categoriesCreated).toBeGreaterThanOrEqual(parsed.result.categories.length);
    // Payees are deduped on normalized name; expect at least 30 distinct.
    expect(summary.payeesCreated).toBeGreaterThanOrEqual(30);
    // The fixture has no transfer pairs — only single-leg rows.
    expect(summary.transfersImported).toBe(0);

    // DB-side sanity: every created account is queryable via the regular API.
    const accountsAfter = await helpers.getAccounts();
    expect(accountsAfter).toHaveLength(6);

    // The big PLN account's starting balance row was an Inflow of 2050.95 —
    // that should land as initialBalance, NOT as a transaction.
    const mainPln = accountsAfter.find((a) => a.name === 'Main PLN (PLN) – 8437')!;
    expect(mainPln.currencyCode).toBe('PLN');
    expect(Number(mainPln.initialBalance)).toBe(2050.95);
  });

  it('returns 404 for an unknown job id', async () => {
    const response = await helpers.getYnabImportStatus({ jobId: 'no-such-job' });
    expect(response.statusCode).toBe(404);
  });

  it('fails the worker job when accountMapping omits an account the parser found', async () => {
    const fileContent = helpers.loadYnabFixture('register-basic.csv');
    const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });
    // Drop one account from the mapping; the executor must refuse to write
    // ANY rows because it cannot decide which currency the orphan account
    // belongs to. Partial-import behavior here would silently lose data.
    const incomplete = Object.fromEntries(
      parsed.result.accounts
        .slice(0, parsed.result.accounts.length - 1)
        .map((a) => [a.originalName, { currencyCode: a.detectedCurrency! }]),
    );
    // The controller only validates payload shape (Zod) and enqueues; the
    // mapping-completeness check fires inside the worker, so the job comes
    // back as `failed` with the parser's account name in the error message.
    const { jobId } = await helpers.executeYnab({
      payload: { fileContent, accountMapping: incomplete },
      raw: true,
    });
    const progress = await waitForCompletion({ jobId });
    expect(progress.status).toBe('failed');
    if (progress.status !== 'failed') throw new Error('unreachable');
    expect(progress.error).toMatch(/Missing account mapping/i);
  });

  it("refuses to leak another user's job status (cross-user authZ)", async () => {
    const fileContent = helpers.loadYnabFixture('register-basic.csv');
    const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });
    const accountMapping = Object.fromEntries(
      parsed.result.accounts.map((a) => [a.originalName, { currencyCode: a.detectedCurrency! }]),
    );
    // User A enqueues an import we deliberately don't wait on — the job's
    // status row exists for User A regardless of whether the worker has
    // finished, which is exactly the surface we want to lock down.
    const { jobId } = await helpers.executeYnab({ payload: { fileContent, accountMapping }, raw: true });

    // User B logs in and asks for the same jobId. The status controller
    // hands back 404 (queue helper returns null for ownership mismatch), not
    // 200 with somebody else's progress payload.
    const otherUser = await signUpSecondUser();
    const statusAsOther = await asUser({
      cookies: otherUser.cookies,
      fn: () => helpers.getYnabImportStatus({ jobId }),
    });
    expect(statusAsOther.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('persists the YNAB transfer pair as two linked legs', async () => {
    const fileContent = helpers.loadYnabFixture('register-basic.csv');
    const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });
    const accountMapping = Object.fromEntries(
      parsed.result.accounts.map((a) => [a.originalName, { currencyCode: a.detectedCurrency! }]),
    );

    const { jobId } = await helpers.executeYnab({ payload: { fileContent, accountMapping }, raw: true });
    const progress = await waitForCompletion({ jobId });
    expectCompleted(progress);
    expect(progress.summary.transfersImported).toBe(1);

    // The basic fixture's only transfer carries the memo "Move to savings"
    // on both legs. They must share a transferId so the unlink/link APIs and
    // the transactions list can pair them.
    const transactionsAfter = await helpers.getTransactions({ raw: true });
    const transferLegs = transactionsAfter.filter((t) => t.note === 'Move to savings');
    expect(transferLegs).toHaveLength(2);
    const [legA, legB] = transferLegs;
    expect(legA!.transferId).toBeTruthy();
    expect(legA!.transferId).toBe(legB!.transferId);
    expect(legA!.accountId).not.toBe(legB!.accountId);

    // Hit the dedicated by-transferId endpoint too — the wizard's followup
    // "look at the transfer" UX uses this exact route.
    const linkedPair = await helpers.getTransactionsByTransferId({ transferId: legA!.transferId!, raw: true });
    expect(linkedPair).toHaveLength(2);
  });
});
