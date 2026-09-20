import type { ExtractedTransaction } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Payee ignore list — API contract and curation writers', () => {
  it('does not fuzzy-link or alias a statement-import merchant whose normalized name is on the ignored list', async () => {
    const account = await helpers.createAccount({ raw: true });
    const youtube = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'YouTube' }),
      raw: true,
    });

    const ignored = await helpers.addIgnoredName({
      rawName: 'payout',
      raw: true,
    });
    expect(ignored.normalizedName).toBe('payout');

    const transactions: ExtractedTransaction[] = [
      {
        date: '2024-01-15 10:30:00',
        description: 'PAYOUT',
        merchant: 'payout',
        amount: 10,
        type: 'expense',
      },
    ];

    const summary = await helpers.statementExecuteImportAndWait({
      payload: { accountId: account.id, transactions, skipIndices: [] },
    });
    expect(summary.imported).toBe(1);

    const imported = await helpers.getTransactionById({
      id: summary.newTransactionIds[0]!,
      raw: true,
    });
    expect(imported!.payeeId).toBeNull();

    const youtubeAfter = await helpers.getPayeeById({
      id: youtube.id,
      raw: true,
    });
    expect(youtubeAfter.aliases?.some((a) => a.normalizedName === 'payout')).toBe(false);

    await helpers.updateUserSettings({
      settings: { locale: 'en', payeeExtractionUsesDescription: true },
    });
    const [noteTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        note: 'payout',
      }),
      raw: true,
    });
    expect(noteTx!.payeeId).toBeNull();
  });
});
