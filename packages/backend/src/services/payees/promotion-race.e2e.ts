import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

/**
 * E2E coverage for occurrence-based Payee promotion under concurrency.
 *
 * Payees are user-scoped and promotion runs inside the shared
 * create-transaction transaction. The bank sync fans an account's siblings out
 * concurrently, so two writers can promote the same normalized merchant at the
 * same time and race on the `payees_user_id_normalized_name_uniq` index. The
 * insert is savepoint-isolated so a losing racer adopts the winner's Payee
 * instead of aborting the shared transaction and cascading into
 * "current transaction is aborted" failures.
 *
 * The HTTP create endpoint has no `rawMerchantName` field, so promotion is
 * driven through the `payeeExtractionUsesDescription` note fallback — the same
 * extraction pipeline the bank sync uses.
 */
const enableNoteExtraction = () =>
  helpers.updateUserSettings({
    settings: { locale: 'en', payeeExtractionUsesDescription: true },
  });

describe('Payee promotion — concurrency safety', () => {
  it('links both transactions to a single Payee on sequential promotion', async () => {
    await enableNoteExtraction();
    const merchant = `SeqMerchant-${generateRandomRecordId()}`;
    const account = await helpers.createAccount({ raw: true });

    // First occurrence: no priors → nothing promoted yet.
    const [seedTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
      raw: true,
    });

    // Second occurrence: 1 prior + current → Payee created, both backfilled.
    const [secondTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
      raw: true,
    });

    const payees = await helpers.listPayees({ raw: true });
    const matches = payees.filter((p) => p.name === merchant);
    expect(matches).toHaveLength(1);

    const payeeId = matches[0]!.id;
    const seedAfter = await helpers.getTransactionById({ id: seedTx!.id, raw: true });
    const secondAfter = await helpers.getTransactionById({ id: secondTx!.id, raw: true });
    expect(seedAfter!.payeeId).toBe(payeeId);
    expect(secondAfter!.payeeId).toBe(payeeId);
  });

  it('creates only one Payee when two transactions promote the same merchant concurrently', async () => {
    await enableNoteExtraction();
    const merchant = `RaceMerchant-${generateRandomRecordId()}`;
    const account = await helpers.createAccount({ raw: true });

    // Seed one prior unmatched occurrence so both concurrent creates below
    // independently qualify for promotion.
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
      raw: true,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
        raw: false,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: merchant }),
        raw: false,
      }),
    ]);

    // Neither create may 500 — a losing racer must recover, not crash.
    expect(firstResponse.statusCode).toBeLessThan(500);
    expect(secondResponse.statusCode).toBeLessThan(500);

    const payees = await helpers.listPayees({ raw: true });
    expect(payees.filter((p) => p.name === merchant)).toHaveLength(1);
  });

  it('creates only one Payee when two accounts of one user promote the same merchant concurrently', async () => {
    await enableNoteExtraction();
    const merchant = `MultiAccountMerchant-${generateRandomRecordId()}`;
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    // Prior unmatched occurrence is user-scoped, so a single seed qualifies
    // promotion attempts on both accounts.
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: accountA.id, note: merchant }),
      raw: true,
    });

    const [firstResponse, secondResponse] = await Promise.all([
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountA.id, note: merchant }),
        raw: false,
      }),
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountB.id, note: merchant }),
        raw: false,
      }),
    ]);

    expect(firstResponse.statusCode).toBeLessThan(500);
    expect(secondResponse.statusCode).toBeLessThan(500);

    const payees = await helpers.listPayees({ raw: true });
    expect(payees.filter((p) => p.name === merchant)).toHaveLength(1);
  });
});
