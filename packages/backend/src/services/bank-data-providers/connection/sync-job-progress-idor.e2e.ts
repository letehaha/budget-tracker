import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { subDays } from 'date-fns';

describe('Sync job progress authorization', () => {
  it("scopes progress to the caller: user B cannot read user A's aggregate, owner still can", async () => {
    // User A (primary test user): connect a provider, link an account and load a
    // period so real batches land in the queue.
    const { connectionId } = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.MONOBANK,
      credentials: { apiToken: VALID_MONOBANK_TOKEN },
      raw: true,
    });

    const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
      connectionId,
      raw: true,
    });

    const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: [externalAccounts[0]!.externalId],
      raw: true,
    });

    const accountId = syncedAccounts[0]!.id;

    global.mswMockServer.use(getMonobankTransactionsMock({ response: helpers.monobank.mockedTransactionData(3) }));

    const loadResult = await helpers.bankDataProviders.loadTransactionsForPeriod({
      connectionId,
      accountId,
      from: subDays(new Date(), 60).toISOString(),
      to: new Date().toISOString(),
      raw: true,
    });

    expect(loadResult.totalBatches).toBeGreaterThan(0);

    const { jobGroupId } = loadResult;

    await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId, timeoutMs: 15000 });

    // Owner reads their own aggregate — completed jobs are retained (removeOnComplete age/count).
    const ownerProgress = await helpers.bankDataProviders.getSyncJobProgress({
      connectionId,
      jobGroupId,
      raw: true,
    });
    expect(ownerProgress.totalBatches).toBe(loadResult.totalBatches);

    // jobGroupId format is `${userId}-${accountId}-${timestamp}`, so the leading
    // segment is user A's numeric id — the exploit input.
    const userAId = jobGroupId.split('-')[0]!;

    const userB = await helpers.provisionSecondUserWithBaseCurrency();

    await helpers.asUser({
      cookies: userB.cookies,
      fn: async () => {
        // ?jobGroupId=<user A's numeric id> used to leak user A's aggregate via a bare prefix match.
        const foreignPrefix = await helpers.bankDataProviders.getSyncJobProgress({
          connectionId,
          jobGroupId: userAId,
          raw: true,
        });
        expect(foreignPrefix.totalBatches).toBe(0);

        // ?jobGroupId= (empty) used to leak a global aggregate across every user.
        const emptyGroup = await helpers.bankDataProviders.getSyncJobProgress({
          connectionId,
          jobGroupId: '',
          raw: true,
        });
        expect(emptyGroup.totalBatches).toBe(0);

        // The full jobGroupId is still foreign to user B.
        const fullGroup = await helpers.bankDataProviders.getSyncJobProgress({
          connectionId,
          jobGroupId,
          raw: true,
        });
        expect(fullGroup.totalBatches).toBe(0);
      },
    });
  });
});
