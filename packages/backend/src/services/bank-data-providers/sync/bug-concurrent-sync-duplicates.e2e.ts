import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import {
  LUNCHFLOW_BASE_URL,
  getLunchFlowBalanceMock,
  getLunchFlowTransactionsMock,
} from '@tests/mocks/lunchflow/mock-api';
import { HttpResponse, delay, http } from 'msw';

type LunchFlowFeed = ReturnType<typeof helpers.lunchflow.mockedTransactionData>;

// Long enough for the second sync request to arrive while the first one still
// holds the account lock.
const FEED_DELAY_MS = 500;
const SECOND_REQUEST_DELAY_MS = 100;

function delayedTransactionsMock({
  response,
  externalAccountId,
}: {
  response: LunchFlowFeed;
  externalAccountId: string;
}) {
  return http.get(`${LUNCHFLOW_BASE_URL}/accounts/${externalAccountId}/transactions`, async () => {
    await delay(FEED_DELAY_MS);
    return HttpResponse.json(response);
  });
}

async function connectLunchFlowAccount({ initialFeed }: { initialFeed: LunchFlowFeed }) {
  const { connectionId } = await helpers.lunchflow.pair();

  const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
    connectionId,
    raw: true,
  });
  const externalAccountId = externalAccounts[0]!.externalId;

  global.mswMockServer.use(
    getLunchFlowTransactionsMock({
      response: initialFeed,
      accountId: externalAccountId,
    }),
    getLunchFlowBalanceMock({ accountId: externalAccountId }),
  );

  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [externalAccountId],
    raw: true,
  });

  return { connectionId, externalAccountId, accountId: syncedAccounts[0]!.id };
}

function namedFeed({ amount, prefix }: { amount: number; prefix: string }): LunchFlowFeed {
  const feed = helpers.lunchflow.mockedTransactionData(amount);
  feed.transactions.forEach((tx, index) => {
    tx.merchant = `${prefix} merchant ${index}`;
    tx.description = `${prefix} description ${index}`;
  });
  return feed;
}

async function importedOriginalIds({ accountId }: { accountId: string }) {
  const rows = await Transactions.findAll({ where: { accountId } });
  return rows.map((row) => String(row.originalId));
}

/** Fires two syncs of the same account so the second one lands while the first holds the lock. */
async function overlappingSyncs({ connectionId, accountId }: { connectionId: string; accountId: string }) {
  const firstRequest = helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });
  await delay(SECOND_REQUEST_DELAY_MS);
  const second = await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });

  return { first: await firstRequest, second };
}

describe('Concurrent bank sync of the same account', () => {
  it('imports a new provider transaction once and rejects the overlapping sync', async () => {
    const baseFeed = namedFeed({ amount: 3, prefix: 'base' });
    const { connectionId, externalAccountId, accountId } = await connectLunchFlowAccount({ initialFeed: baseFeed });

    const feedWithNewTx: LunchFlowFeed = {
      transactions: [
        ...baseFeed.transactions,
        {
          ...baseFeed.transactions[0]!,
          id: 'concurrent-sync-new-tx',
          date: new Date().toISOString(),
          merchant: 'concurrent sync merchant',
          description: 'concurrent sync description',
        },
      ],
      total: baseFeed.transactions.length + 1,
    };

    global.mswMockServer.use(
      delayedTransactionsMock({ response: feedWithNewTx, externalAccountId }),
      getLunchFlowBalanceMock({ accountId: externalAccountId }),
    );

    const { first, second } = await overlappingSyncs({ connectionId, accountId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(ERROR_CODES.Locked);

    const originalIds = await importedOriginalIds({ accountId });

    expect(new Set(originalIds).size).toBe(originalIds.length);
    expect(originalIds.length).toBe(feedWithNewTx.transactions.length);
  });

  it('imports the whole feed once when a sync overlaps on an account with no prior transactions', async () => {
    const { connectionId, externalAccountId, accountId } = await connectLunchFlowAccount({
      initialFeed: { transactions: [], total: 0 },
    });

    const feed = namedFeed({ amount: 3, prefix: 'backfill' });

    global.mswMockServer.use(
      delayedTransactionsMock({ response: feed, externalAccountId }),
      getLunchFlowBalanceMock({ accountId: externalAccountId }),
    );

    const { first, second } = await overlappingSyncs({ connectionId, accountId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(ERROR_CODES.Locked);

    const originalIds = await importedOriginalIds({ accountId });

    expect(new Set(originalIds).size).toBe(originalIds.length);
    expect(originalIds.length).toBe(feed.transactions.length);
  });
});
