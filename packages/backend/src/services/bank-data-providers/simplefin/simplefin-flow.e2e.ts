import { ACCOUNT_TYPES, BANK_PROVIDER_TYPE, DEACTIVATION_REASON, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Balances from '@models/balances.model';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import {
  SIMPLEFIN_ACCOUNT_1,
  SIMPLEFIN_ACCOUNT_2,
  getMockedSimplefinAccountSet,
  getMockedSimplefinAccountSetV2,
  getMockedSimplefinTransactions,
  getMockedSimplefinTransactionsOnDaysAgo,
  getMockedSimplefinTransactionsWithPending,
} from '@tests/mocks/simplefin/data';
import {
  INVALID_SIMPLEFIN_SETUP_TOKEN,
  NON_URL_SIMPLEFIN_SETUP_TOKEN,
  RATE_LIMITED_SIMPLEFIN_SETUP_TOKEN,
  SERVER_ERROR_SIMPLEFIN_SETUP_TOKEN,
  VALID_SIMPLEFIN_SETUP_TOKEN,
  createSimplefinAccountsRecorder,
  getSimplefinAccountsErrorMock,
  getSimplefinAccountsMock,
} from '@tests/mocks/simplefin/mock-api';
import { subDays } from 'date-fns';
import { Op } from 'sequelize';

/**
 * E2E tests for the SimpleFIN Bridge data provider.
 * Covers the full flow: setup-token claim → connect → list/import accounts →
 * transaction sync (incremental + period load), plus error and empty states.
 */
const connectSimplefin = async (setupToken: string = VALID_SIMPLEFIN_SETUP_TOKEN): Promise<string> => {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
    credentials: { setupToken },
    raw: true,
  });
  return connectionId;
};

const importFirstAccount = async (connectionId: string): Promise<string> => {
  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
    raw: true,
  });
  return syncedAccounts[0]!.id;
};

/** Connect, expose the given transactions on the first account, then import it. */
const connectAndImport = async (
  account1Transactions = getMockedSimplefinTransactions(5),
): Promise<{ connectionId: string; accountId: string }> => {
  const connectionId = await connectSimplefin();
  global.mswMockServer.use(
    getSimplefinAccountsMock({ response: getMockedSimplefinAccountSet({ account1Transactions }) }),
  );
  const accountId = await importFirstAccount(connectionId);
  return { connectionId, accountId };
};

describe('SimpleFIN Data Provider E2E', () => {
  describe('Complete connection flow', () => {
    it('completes: list providers -> connect -> list connections -> list external accounts -> import -> details', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });
      const simplefinProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.SIMPLEFIN)!;
      expect(simplefinProvider).toBeDefined();
      expect(simplefinProvider.name).toBe('SimpleFIN');

      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });
      expect(connectResult.connectionId).toBeDefined();
      const { connectionId } = connectResult;

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: string }) => c.id === connectionId);
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.SIMPLEFIN);
      expect(connection?.providerName).toBe('SimpleFIN');
      expect(connection?.isActive).toBe(true);

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });
      expect(externalAccounts.length).toBe(2);
      expect(externalAccounts.map((a: { externalId: string }) => a.externalId)).toEqual(
        expect.arrayContaining([SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2]),
      );

      // Embed transactions on the checking account for the initial sync.
      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({ account1Transactions: getMockedSimplefinTransactions(3) }),
        }),
      );

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2],
        raw: true,
      });
      expect(syncedAccounts.length).toBe(2);

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(details.accounts.length).toBe(2);
      details.accounts.forEach((account: { currencyCode: string }) => {
        expect(account.currencyCode).toBe('USD');
      });
    });
  });

  describe('Connect provider', () => {
    it('connects with a valid setup token', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });
      expect(result.connectionId).toBeDefined();
    });

    it('auto-names the connection "SimpleFIN"', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });
      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: string }) => c.id === result.connectionId);
      expect(connection?.providerName).toBe('SimpleFIN');
    });

    it('fails with an invalid / used setup token', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { setupToken: INVALID_SIMPLEFIN_SETUP_TOKEN } },
      });
      expect(result.status).toEqual(ERROR_CODES.Forbidden);
    });

    it('fails with a missing setupToken field', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { wrongField: 'value' } },
      });
      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('does not create a connection on auth failure', async () => {
      const { connections: before } = await helpers.bankDataProviders.listUserConnections({ raw: true });

      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { setupToken: INVALID_SIMPLEFIN_SETUP_TOKEN } },
      });

      const { connections: after } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      expect(after.length).toBe(before.length);
    });

    it('names a second SimpleFIN connection "SimpleFIN (2)"', async () => {
      await connectSimplefin();
      const second = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const secondConnection = connections.find((c: { id: string }) => c.id === second.connectionId);
      expect(secondConnection?.providerName).toBe('SimpleFIN (2)');
    });

    it('rejects a setup token that does not decode to a URL', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { setupToken: NON_URL_SIMPLEFIN_SETUP_TOKEN } },
      });
      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('surfaces a claim rate-limit (429) instead of calling the token invalid', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { setupToken: RATE_LIMITED_SIMPLEFIN_SETUP_TOKEN } },
      });
      expect(result.status).toEqual(ERROR_CODES.TooManyRequests);
    });

    it('propagates a claim server error (5xx) rather than masking it as a bad token', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.SIMPLEFIN}/connect`,
        payload: { credentials: { setupToken: SERVER_ERROR_SIMPLEFIN_SETUP_TOKEN } },
      });
      expect(result.status).toBeGreaterThanOrEqual(500);
    });
  });

  describe('List external accounts', () => {
    it('returns 404 for a non-existent connection', async () => {
      const result = await helpers.bankDataProviders.listExternalAccounts({ connectionId: generateRandomRecordId() });
      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('returns accounts with the expected shape', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
      const account = accounts[0]!;
      expect(account).toHaveProperty('externalId');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('balance');
      expect(account.currency).toBe('USD');
      expect(typeof account.balance).toBe('number');
    });

    it('skips accounts whose currency is not an ISO code (e.g. crypto URL)', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      const customSet = getMockedSimplefinAccountSet();
      customSet.accounts.push({
        org: { name: 'Crypto Exchange' },
        id: 'ACT-CRYPTO',
        name: 'BTC Wallet',
        currency: 'https://example.com/currencies/btc',
        balance: '0.5',
        'balance-date': Math.floor(Date.now() / 1000),
        transactions: [],
      });
      global.mswMockServer.use(getSimplefinAccountsMock({ response: customSet }));

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
      expect(accounts.length).toBe(2);
      expect(accounts.find((a: { externalId: string }) => a.externalId === 'ACT-CRYPTO')).toBeUndefined();
    });
  });

  describe('Transaction sync', () => {
    it('syncs transactions automatically when importing accounts', async () => {
      const MOCK_AMOUNT = 5;
      const { accountId } = await connectAndImport(getMockedSimplefinTransactions(MOCK_AMOUNT));

      const transactions = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(transactions.length).toBe(MOCK_AMOUNT);
    });

    it('skips pending transactions (posted = 0)', async () => {
      const MOCK_AMOUNT = 5;
      const { accountId } = await connectAndImport(getMockedSimplefinTransactionsWithPending(MOCK_AMOUNT));

      const transactions = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(transactions.length).toBe(MOCK_AMOUNT - 1);
    });

    it('does not duplicate transactions on re-sync', async () => {
      const MOCK_AMOUNT = 3;
      const transactions = getMockedSimplefinTransactions(MOCK_AMOUNT);
      const { connectionId, accountId } = await connectAndImport(transactions);

      // Re-sync with the same data.
      global.mswMockServer.use(
        getSimplefinAccountsMock({ response: getMockedSimplefinAccountSet({ account1Transactions: transactions }) }),
      );
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const stored = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(stored.length).toBe(MOCK_AMOUNT);
    });

    it('syncs zero transactions when the account has none (empty state)', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      // Default mock returns accounts with no transactions.
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
        raw: true,
      });

      const transactions = await Transactions.findAll({
        where: { accountId: { [Op.in]: syncedAccounts.map((a) => a.id) } },
        raw: true,
      });
      expect(transactions.length).toBe(0);
    });
  });

  describe('Batched connection sync', () => {
    it('imports all selected accounts in one batched pass (no per-account requests)', async () => {
      const connectionId = await connectSimplefin();

      // Transactions live on the first account; the second is empty.
      const txns = getMockedSimplefinTransactions(4);
      const recorder = createSimplefinAccountsRecorder({ account1Transactions: txns });
      global.mswMockServer.use(recorder.handler);

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2],
        raw: true,
      });
      expect(syncedAccounts.length).toBe(2);

      // The whole point of batching: every `/accounts` call fetches ALL accounts
      // at once, so none carry the single-account `account` filter. The old
      // per-account path would have set it on each windowed sync request.
      expect(recorder.requests.length).toBeGreaterThan(0);
      expect(recorder.requests.every((url) => url.searchParams.get('account') === null)).toBe(true);
      // Version is still negotiated on every request.
      expect(recorder.requests.every((url) => url.searchParams.get('version') === '2')).toBe(true);

      // Both accounts were processed from the single shared response.
      const account1Id = syncedAccounts.find((a) => a.externalId === SIMPLEFIN_ACCOUNT_1)!.id;
      const account2Id = syncedAccounts.find((a) => a.externalId === SIMPLEFIN_ACCOUNT_2)!.id;
      expect(await Transactions.count({ where: { accountId: account1Id } })).toBe(4);
      expect(await Transactions.count({ where: { accountId: account2Id } })).toBe(0);
    });

    it('persists current balance and writes a Balance history snapshot for today', async () => {
      // SimpleFIN does not provide a per-transaction balance, so the batched
      // sync is the only writer of balance history for the provider — without
      // this assertion a regression to "currentBalance updated, but no Balance
      // row written" would silently flatten the analytics chart.
      const connectionId = await connectSimplefin();

      // Default mock balances: ACCOUNT_1 = "1523.45" USD, ACCOUNT_2 = "850.00" USD.
      global.mswMockServer.use(getSimplefinAccountsMock({ response: getMockedSimplefinAccountSet() }));

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1, SIMPLEFIN_ACCOUNT_2],
        raw: true,
      });

      const account1Id = syncedAccounts.find((a) => a.externalId === SIMPLEFIN_ACCOUNT_1)!.id;
      const account2Id = syncedAccounts.find((a) => a.externalId === SIMPLEFIN_ACCOUNT_2)!.id;

      const account1 = await helpers.getAccount({ id: account1Id, raw: true });
      const account2 = await helpers.getAccount({ id: account2Id, raw: true });

      // Account row carries the decimal-serialized balance from the response.
      expect(Number(account1.currentBalance)).toBe(1523.45);
      expect(Number(account2.currentBalance)).toBe(850);

      // A Balance row exists for today (date-only column) for each account.
      const balances1 = await Balances.findAll({ where: { accountId: account1Id } });
      const balances2 = await Balances.findAll({ where: { accountId: account2Id } });
      const today = new Date().toISOString().slice(0, 10);
      expect(balances1.some((b) => new Date(b.date).toISOString().slice(0, 10) === today)).toBe(true);
      expect(balances2.some((b) => new Date(b.date).toISOString().slice(0, 10) === today)).toBe(true);
    });
  });

  describe('Load transactions for a period', () => {
    it('loads historical transactions for a selected window', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      // Import with no transactions so the initial sync inserts nothing.
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
        raw: true,
      });
      const accountId = syncedAccounts[0]!.id;
      expect(await Transactions.count({ where: { accountId } })).toBe(0);

      // Now make historical transactions available and load a 90-day window.
      const PERIOD_AMOUNT = 4;
      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({
            account1Transactions: getMockedSimplefinTransactions(PERIOD_AMOUNT),
          }),
        }),
      );

      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionId}/load-transactions-for-period`,
        payload: {
          accountId,
          from: subDays(new Date(), 90).toISOString(),
          to: new Date().toISOString(),
        },
      });
      expect(result.status).toBeLessThan(400);

      const transactions = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(transactions.length).toBe(PERIOD_AMOUNT);
    });

    it('returns an inline result shape (jobGroupId null + createdCount)', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      const PERIOD_AMOUNT = 3;
      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({
            account1Transactions: getMockedSimplefinTransactions(PERIOD_AMOUNT),
          }),
        }),
      );

      const result = (await helpers.bankDataProviders.loadTransactionsForPeriod({
        connectionId,
        accountId,
        from: subDays(new Date(), 30).toISOString(),
        to: new Date().toISOString(),
        raw: true,
      })) as unknown as { jobGroupId: string | null; createdCount?: number; message: string };

      expect(result.jobGroupId).toBeNull();
      expect(result.createdCount).toBe(PERIOD_AMOUNT);
      expect(typeof result.message).toBe('string');
    });

    it('pages a >90-day window into multiple requests and stores every transaction once', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);
      expect(await Transactions.count({ where: { accountId } })).toBe(0);

      // One transaction spread across the ~44-day windows of a 200-day range.
      const txns = getMockedSimplefinTransactionsOnDaysAgo([190, 100, 10]);
      const recorder = createSimplefinAccountsRecorder({ account1Transactions: txns, windowed: true });
      global.mswMockServer.use(recorder.handler);

      const result = (await helpers.bankDataProviders.loadTransactionsForPeriod({
        connectionId,
        accountId,
        from: subDays(new Date(), 200).toISOString(),
        to: new Date().toISOString(),
        raw: true,
      })) as unknown as { createdCount?: number };

      // Multiple windows, each carrying version=2, and no double-counting.
      expect(recorder.requests.length).toBeGreaterThanOrEqual(3);
      expect(recorder.requests.every((url) => url.searchParams.get('version') === '2')).toBe(true);

      const stored = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(stored.length).toBe(3);
      expect(result.createdCount).toBe(3);
    });
  });

  describe('Disconnect', () => {
    it('disconnects a SimpleFIN connection', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      await helpers.bankDataProviders.disconnectProvider({ connectionId, raw: true });

      const result = await helpers.makeRequest({
        method: 'get',
        url: `/bank-data-providers/connections/${connectionId}`,
      });
      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });
  });

  describe('Account type', () => {
    it('creates accounts with the simplefin account type', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.SIMPLEFIN,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [SIMPLEFIN_ACCOUNT_1],
        raw: true,
      });

      const account = await helpers.getAccount({ id: syncedAccounts[0]!.id, raw: true });
      expect(account.type).toBe(ACCOUNT_TYPES.simplefin);
      expect(account.externalId).toBe(SIMPLEFIN_ACCOUNT_1);
    });
  });

  describe('Protocol v2', () => {
    it('requests the /accounts endpoint with version=2', async () => {
      const connectionId = await connectSimplefin();

      const recorder = createSimplefinAccountsRecorder();
      global.mswMockServer.use(recorder.handler);

      await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });

      expect(recorder.requests.length).toBeGreaterThan(0);
      expect(recorder.requests.every((url) => url.searchParams.get('version') === '2')).toBe(true);
    });

    it('resolves institution details from the v2 connections[] array (no embedded org)', async () => {
      const connectionId = await connectSimplefin();

      global.mswMockServer.use(getSimplefinAccountsMock({ response: getMockedSimplefinAccountSetV2() }));

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
      expect(accounts.length).toBe(2);
      const checking = accounts.find((a: { externalId: string }) => a.externalId === SIMPLEFIN_ACCOUNT_1)!;
      expect(checking.metadata?.institutionName).toBe('Test Bank');
    });
  });

  describe('Structured errors (errlist)', () => {
    it('treats a con.auth errlist entry on a 200 response as an auth failure', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({
            errlist: [{ code: 'con.auth', msg: 'Connection credentials rejected' }],
          }),
        }),
      );

      // Two failures hit the deactivation threshold.
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(connection.isActive).toBe(false);
      expect(connection.deactivationReason).toBe(DEACTIVATION_REASON.AUTH_FAILURE);
    });

    it('does not abort or deactivate on a non-auth errlist entry (act.missingdata)', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({
            account1Transactions: getMockedSimplefinTransactions(3),
            errlist: [{ code: 'act.missingdata', msg: 'Incomplete transaction listing' }],
          }),
        }),
      );

      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId, raw: true });

      const stored = await Transactions.findAll({ where: { accountId }, raw: true });
      expect(stored.length).toBe(3);

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(connection.isActive).toBe(true);
    });
  });

  describe('Auth-failure tracking', () => {
    it('deactivates the connection after repeated 403s and records AUTH_FAILURE', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 403 }));

      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(connection.isActive).toBe(false);
      expect(connection.deactivationReason).toBe(DEACTIVATION_REASON.AUTH_FAILURE);
    });

    it('does not deactivate on a transient rate limit (429)', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 429 }));

      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(connection.isActive).toBe(true);
      expect(connection.deactivationReason).toBeNull();
    });
  });

  describe('Refresh credentials', () => {
    it('reactivates a deactivated connection and clears the failure state', async () => {
      const connectionId = await connectSimplefin();
      const accountId = await importFirstAccount(connectionId);

      // Drive the connection into the deactivated state via repeated auth failures.
      global.mswMockServer.use(getSimplefinAccountsErrorMock({ status: 403 }));
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });
      await helpers.bankDataProviders.syncTransactionsForAccount({ connectionId, accountId });

      const deactivated = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(deactivated.connection.isActive).toBe(false);

      // Restore the bridge and re-submit a fresh setup token.
      global.mswMockServer.use(getSimplefinAccountsMock({ response: getMockedSimplefinAccountSet() }));
      await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        credentials: { setupToken: VALID_SIMPLEFIN_SETUP_TOKEN },
        raw: true,
      });

      const reactivated = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(reactivated.connection.isActive).toBe(true);
      expect(reactivated.connection.deactivationReason).toBeNull();
    });
  });

  describe('Amount mapping', () => {
    it('maps positive amounts to income and negative amounts to expense', async () => {
      const connectionId = await connectSimplefin();

      const posted = Math.floor(Date.now() / 1000);
      global.mswMockServer.use(
        getSimplefinAccountsMock({
          response: getMockedSimplefinAccountSet({
            account1Transactions: [
              { id: 'sf-income', posted, amount: '120.50', description: 'Salary', pending: false },
              { id: 'sf-expense', posted, amount: '-45.30', description: 'Groceries', pending: false },
            ],
          }),
        }),
      );

      const accountId = await importFirstAccount(connectionId);

      const stored = await Transactions.findAll({ where: { accountId }, raw: true });
      const income = stored.find((tx) => tx.originalId === 'sf-income')!;
      const expense = stored.find((tx) => tx.originalId === 'sf-expense')!;
      expect(income.transactionType).toBe(TRANSACTION_TYPES.income);
      expect(expense.transactionType).toBe(TRANSACTION_TYPES.expense);
    });
  });
});
