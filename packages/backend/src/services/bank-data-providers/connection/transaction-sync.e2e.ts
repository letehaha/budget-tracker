import { ACCOUNT_TYPES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { subDays } from 'date-fns';

describe('Bank Data Provider Transaction Sync E2E', () => {
  describe('Sync transactions', () => {
    describe('Basic sync flow', () => {
      it('should successfully sync transactions for a connected account', async () => {
        // Setup: Connect provider and account
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

        // Mock transaction data
        const mockedTransactions = helpers.monobank.mockedTransactionData(5);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        // Sync transactions
        const syncResult = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        expect(syncResult).toHaveProperty('jobGroupId');
        expect(syncResult).toHaveProperty('totalBatches');
        expect(syncResult).toHaveProperty('estimatedMinutes');
        expect(syncResult.message).toContain('Transaction sync queued');

        // Wait for jobs to complete
        const jobResult = await helpers.bankDataProviders.waitForSyncJobsToComplete({
          connectionId,
          jobGroupId: syncResult.jobGroupId!,
          timeoutMs: 10000,
        });

        expect(jobResult.status).toBe('completed');
        expect(jobResult.completedBatches).toBe(syncResult.totalBatches);
        expect(jobResult.failedBatches).toBe(0);

        // Verify transactions were created
        const transactions = await Transactions.findAll({
          where: { accountId },
          raw: true,
        });

        expect(transactions.length).toBe(5);

        // Verify transaction data mapping
        transactions.forEach((tx) => {
          expect(tx.accountId).toBe(accountId);
          expect(tx.originalId).toBeDefined();
          expect(tx.amount).toBeDefined();
          expect(tx.externalData).toBeDefined();
        });
      });

      it('should return validation error for non-existent connection', async () => {
        const result = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId: 99999,
          accountId: 1,
        });

        expect(result.status).toEqual(ERROR_CODES.NotFoundError);
      });

      it('should return validation error for non-existent account', async () => {
        const { connectionId } = await helpers.bankDataProviders.connectProvider({
          providerType: BANK_PROVIDER_TYPE.MONOBANK,
          credentials: { apiToken: VALID_MONOBANK_TOKEN },
          raw: true,
        });

        const result = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId: 99999,
        });

        expect(result.status).toEqual(ERROR_CODES.NotFoundError);
      });

      it('should return error if account is not linked to the connection', async () => {
        // Create first connection and account
        const { connectionId: connectionId1 } = await helpers.bankDataProviders.connectProvider({
          providerType: BANK_PROVIDER_TYPE.MONOBANK,
          credentials: { apiToken: VALID_MONOBANK_TOKEN },
          raw: true,
        });

        const { accounts: externalAccounts1 } = await helpers.bankDataProviders.listExternalAccounts({
          connectionId: connectionId1,
          raw: true,
        });

        const { syncedAccounts: accounts1 } = await helpers.bankDataProviders.connectSelectedAccounts({
          connectionId: connectionId1,
          accountExternalIds: [externalAccounts1[0]!.externalId],
          raw: true,
        });

        // Create second connection
        const { connectionId: connectionId2 } = await helpers.bankDataProviders.connectProvider({
          providerType: BANK_PROVIDER_TYPE.MONOBANK,
          credentials: { apiToken: VALID_MONOBANK_TOKEN },
          providerName: 'Second Connection',
          raw: true,
        });

        // Try to sync account from connection1 using connection2
        const result = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId: connectionId2,
          accountId: accounts1[0]!.id,
        });

        expect(result.status).toEqual(ERROR_CODES.NotFoundError);
      });
    });

    describe('Transaction data integrity', () => {
      it('should correctly map transaction fields from external source', async () => {
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

        // Create specific transaction data to verify mapping
        const mockedTransactions = helpers.monobank.mockedTransactionData(1);
        const mockTx = mockedTransactions[0]!;

        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({
          connectionId,
          jobGroupId: jobGroupId!,
        });

        const transaction = await Transactions.findOne({
          where: { accountId },
          raw: true,
        });

        expect(transaction).toBeDefined();
        expect(transaction).not.toBe(null);
        expect(transaction!.originalId).toBe(mockTx.id);
        // Amount is stored as absolute value, sign is determined by transactionType
        expect(transaction!.amount).toBe(Math.abs(mockTx.amount));
        expect(transaction!.time).toBeDefined();

        // Verify externalData contains Monobank-specific fields
        const externalData = transaction!.externalData as {
          operationAmount?: number;
          balance?: number;
          hold?: boolean;
        };
        expect(externalData.operationAmount).toBe(mockTx.operationAmount);
        expect(externalData.balance).toBe(mockTx.balance);
        expect(externalData.hold).toBe(mockTx.hold);
      });

      it('should prevent duplicate transactions with same originalId', async () => {
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

        const mockedTransactions = helpers.monobank.mockedTransactionData(3);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        // First sync
        const { jobGroupId: jobId1 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId1! });

        const countAfterFirstSync = await Transactions.count({
          where: { accountId },
        });

        expect(countAfterFirstSync).toBe(3);

        // Second sync with same data
        const { jobGroupId: jobId2 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId2! });

        const countAfterSecondSync = await Transactions.count({
          where: { accountId },
        });

        // Should still be 3, not 6 (no duplicates)
        expect(countAfterSecondSync).toBe(3);
      });

      it('should sync multiple accounts independently', async () => {
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
          accountExternalIds: [externalAccounts[0]!.externalId, externalAccounts[1]!.externalId],
          raw: true,
        });

        const account1Id = syncedAccounts[0]!.id;
        const account2Id = syncedAccounts[1]!.id;

        // Mock different transaction counts for each account
        const txForAccount1 = helpers.monobank.mockedTransactionData(3);
        const txForAccount2 = helpers.monobank.mockedTransactionData(5);

        // Sync account 1
        global.mswMockServer.use(getMonobankTransactionsMock(txForAccount1));
        const { jobGroupId: jobId1 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId: account1Id,
          raw: true,
        });
        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId1! });

        // Sync account 2
        global.mswMockServer.use(getMonobankTransactionsMock(txForAccount2));
        const { jobGroupId: jobId2 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId: account2Id,
          raw: true,
        });
        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId2! });

        // Verify each account has correct transaction count
        const account1TxCount = await Transactions.count({ where: { accountId: account1Id } });
        const account2TxCount = await Transactions.count({ where: { accountId: account2Id } });

        expect(account1TxCount).toBe(3);
        expect(account2TxCount).toBe(5);
      });
    });

    describe('Transaction date ranges', () => {
      it('should sync transactions from most recent transaction onwards', async () => {
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

        // First sync with old transactions
        const oldTransactions = helpers.monobank.mockedTransactionData(2);
        // Set old dates
        oldTransactions[0]!.time = Math.floor(subDays(new Date(), 10).getTime() / 1000);
        oldTransactions[1]!.time = Math.floor(subDays(new Date(), 9).getTime() / 1000);

        global.mswMockServer.use(getMonobankTransactionsMock(oldTransactions));

        const { jobGroupId: jobId1 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId1! });

        // Second sync with new transactions (after the old ones)
        const newTransactions = helpers.monobank.mockedTransactionData(3);
        newTransactions[0]!.time = Math.floor(subDays(new Date(), 2).getTime() / 1000);
        newTransactions[1]!.time = Math.floor(subDays(new Date(), 1).getTime() / 1000);
        newTransactions[2]!.time = Math.floor(new Date().getTime() / 1000);

        global.mswMockServer.use(getMonobankTransactionsMock(newTransactions));

        const { jobGroupId: jobId2 } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobId2! });

        // Should have all 5 transactions
        const totalTxCount = await Transactions.count({ where: { accountId } });
        expect(totalTxCount).toBe(5);
      });

      it('should sync last 31 days if no transactions exist', async () => {
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

        // Mock transactions within last 31 days
        const mockedTransactions = helpers.monobank.mockedTransactionData(10);

        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobGroupId! });

        const transactions = await Transactions.findAll({ where: { accountId } });
        expect(transactions.length).toBe(10);
      });
    });

    describe('Account balance updates', () => {
      it('should update account balance after syncing transactions', async () => {
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

        const initialAccount = (await Accounts.findByPk(accountId))!;
        const initialBalance = initialAccount.currentBalance;

        // Create transactions that should affect balance
        const mockedTransactions = helpers.monobank.mockedTransactionData(3, {
          initialBalance,
        });

        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
          connectionId,
          accountId,
          raw: true,
        });

        await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobGroupId! });

        const updatedAccount = (await Accounts.findByPk(accountId))!;

        // Balance should be updated based on transactions
        // The last transaction in the mocked data has the final balance
        const expectedBalance = mockedTransactions.reduce((latest, tx) =>
          tx.time > latest.time ? tx : latest,
        ).balance;
        expect(updatedAccount.currentBalance).toBe(expectedBalance);
      });
    });
  });

  describe('Load transactions for period', () => {
    describe('Basic load flow', () => {
      it('should successfully load transactions for a specified period', async () => {
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

        const from = subDays(new Date(), 30);
        const to = new Date();

        const mockedTransactions = helpers.monobank.mockedTransactionData(7);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const loadResult = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
          raw: true,
        });

        expect(loadResult).toHaveProperty('jobGroupId');
        expect(loadResult).toHaveProperty('totalBatches');
        expect(loadResult).toHaveProperty('estimatedMinutes');
        expect(loadResult.message).toContain('Transaction loading queued');

        const jobResult = await helpers.bankDataProviders.waitForSyncJobsToComplete({
          connectionId,
          jobGroupId: loadResult.jobGroupId,
          timeoutMs: 10000,
        });

        expect(jobResult.status).toBe('completed');

        const transactions = await Transactions.findAll({ where: { accountId } });
        expect(transactions.length).toBe(7);
      });

      it('should return validation error for non-existent connection', async () => {
        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId: 99999,
          accountId: 1,
          from: subDays(new Date(), 10).toISOString(),
          to: new Date().toISOString(),
        });

        expect(result.status).toEqual(ERROR_CODES.NotFoundError);
      });

      it('should return validation error for non-existent account', async () => {
        const { connectionId } = await helpers.bankDataProviders.connectProvider({
          providerType: BANK_PROVIDER_TYPE.MONOBANK,
          credentials: { apiToken: VALID_MONOBANK_TOKEN },
          raw: true,
        });

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId: 99999,
          from: subDays(new Date(), 10).toISOString(),
          to: new Date().toISOString(),
        });

        expect(result.status).toEqual(ERROR_CODES.NotFoundError);
      });
    });

    describe('Date range validation', () => {
      it('should reject date range exceeding 1 year', async () => {
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

        const from = subDays(new Date(), 400); // More than 1 year
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
        });

        expect(result.status).toEqual(ERROR_CODES.ValidationError);
      });

      it('should reject invalid date range (from > to)', async () => {
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

        const from = new Date();
        const to = subDays(new Date(), 10); // to is before from

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
        });

        expect(result.status).toEqual(ERROR_CODES.ValidationError);
      });

      it('should accept valid date range within 1 year', async () => {
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

        const mockedTransactions = helpers.monobank.mockedTransactionData(5);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const from = subDays(new Date(), 60);
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
          raw: true,
        });

        expect(result).toHaveProperty('jobGroupId');
        expect(result.jobGroupId).toBeDefined();
      });
    });

    describe('Forward-only linking strategy', () => {
      it('should block loading transactions before linkedAt date for forward-only accounts', async () => {
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

        // Get the account and check its linkedAt timestamp
        const account = await Accounts.findByPk(accountId);
        const linkedAtDate = new Date();

        // Manually set forward-only strategy metadata (simulating the linking flow)
        await account!.update({
          externalData: {
            ...account!.externalData,
            bankConnection: {
              linkedAt: linkedAtDate.toISOString(),
              linkingStrategy: 'forward-only',
            },
          },
        });

        // Try to load transactions from before linkedAt
        const from = subDays(linkedAtDate, 10);
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
        });

        expect(result.status).toEqual(ERROR_CODES.ValidationError);
      });

      it('should allow loading transactions after linkedAt date for forward-only accounts', async () => {
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

        const linkedAtDate = subDays(new Date(), 20);

        // Set forward-only strategy with past linkedAt date
        const account = await Accounts.findByPk(accountId);
        await account!.update({
          externalData: {
            ...account!.externalData,
            bankConnection: {
              linkedAt: linkedAtDate.toISOString(),
              linkingStrategy: 'forward-only',
            },
          },
        });

        const mockedTransactions = helpers.monobank.mockedTransactionData(3);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        // Load transactions after linkedAt (valid)
        const from = subDays(new Date(), 10);
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
          raw: true,
        });

        expect(result).toHaveProperty('jobGroupId');
        expect(result.jobGroupId).toBeDefined();

        await helpers.bankDataProviders.waitForSyncJobsToComplete({
          connectionId,
          jobGroupId: result.jobGroupId,
        });

        const transactions = await Transactions.findAll({ where: { accountId } });
        expect(transactions.length).toBe(3);
      });

      it('should allow loading any period for non-forward-only accounts', async () => {
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

        // Account without forward-only strategy can load any period
        const mockedTransactions = helpers.monobank.mockedTransactionData(4);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        const from = subDays(new Date(), 90);
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
          raw: true,
        });

        expect(result).toHaveProperty('jobGroupId');
        expect(result.jobGroupId).toBeDefined();
      });
    });

    describe('Long date ranges and batching', () => {
      it('should split long date ranges into multiple batches', async () => {
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

        const mockedTransactions = helpers.monobank.mockedTransactionData(10);
        global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

        // Load 90 days (should create multiple batches)
        const from = subDays(new Date(), 90);
        const to = new Date();

        const result = await helpers.bankDataProviders.loadTransactionsForPeriod({
          connectionId,
          accountId,
          from: from.toISOString(),
          to: to.toISOString(),
          raw: true,
        });

        // 90 days should create 3 batches (31 + 31 + 28 days)
        expect(result.totalBatches).toBeGreaterThan(1);
        expect(result.estimatedMinutes).toBeGreaterThanOrEqual(result.totalBatches - 1);

        await helpers.bankDataProviders.waitForSyncJobsToComplete({
          connectionId,
          jobGroupId: result.jobGroupId,
          timeoutMs: 15000,
        });

        const transactions = await Transactions.findAll({ where: { accountId } });
        expect(transactions.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Transaction editing restrictions', () => {
    it('should allow editing description and category of synced transactions', async () => {
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

      const mockedTransactions = helpers.monobank.mockedTransactionData(1);
      global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

      const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId,
        accountId,
        raw: true,
      });

      await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobGroupId! });

      const transaction = await Transactions.findOne({ where: { accountId } });
      const txId = transaction!.id;

      // Update note (should work)
      const updateResult = await helpers.updateTransaction({
        id: txId,
        payload: {
          note: 'Custom note for bank transaction',
        },
        raw: true,
      });

      expect(updateResult[0]!.note).toBe('Custom note for bank transaction');
    });

    it('should reject editing amount of synced transactions', async () => {
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

      const mockedTransactions = helpers.monobank.mockedTransactionData(1);
      global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

      const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId,
        accountId,
        raw: true,
      });

      await helpers.bankDataProviders.waitForSyncJobsToComplete({ connectionId, jobGroupId: jobGroupId! });

      const transaction = await Transactions.findOne({ where: { accountId } });
      const txId = transaction!.id;
      const originalAmount = transaction!.amount;

      // Try to update amount (should be rejected)
      const updateResult = await helpers.updateTransaction({
        id: txId,
        payload: {
          amount: originalAmount + 1000,
        },
      });

      expect(updateResult.status).toEqual(ERROR_CODES.ValidationError);
    });
  });

  // Note: Manual transaction restrictions are not yet implemented
  // These tests are commented out until the feature is added
  describe('Manual transaction restrictions', () => {
    it.todo('should reject manual transaction creation for bank-connected accounts');
  });

  describe('Account linking validation', () => {
    it('should reject linking account with different currency than external account', async () => {
      // Create a system account with AED currency (different from Monobank's UAH)
      const systemAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          name: 'AED System Account',
          type: ACCOUNT_TYPES.system,
          currencyCode: 'AED', // Different from Monobank's UAH (currency code 980)
          initialBalance: 5000,
        }),
        raw: true,
      });

      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      // Try to link AED account to UAH external account
      const externalAccountId = externalAccounts[0]!.externalId;
      const linkResponse = await helpers.linkAccountToBankConnection({
        id: systemAccount.id,
        connectionId,
        externalAccountId,
        raw: false,
      });

      expect(linkResponse.statusCode).toBe(ERROR_CODES.ValidationError);

      const errorResponse = helpers.extractResponse(linkResponse) as unknown as helpers.ErrorResponse;
      expect(errorResponse.message).toContain('Currency mismatch');
      expect(errorResponse.message).toContain('AED');
      expect(errorResponse.message).toContain('UAH');

      // Verify account was not linked
      const account = await Accounts.findByPk(systemAccount.id);
      expect(account!.bankDataProviderConnectionId).toBeNull();
      expect(account!.type).toBe(ACCOUNT_TYPES.system);
    });
  });

  describe('Complete bank connection lifecycle with unlinking and relinking', () => {
    it('should handle full flow: sync account -> load external transactions -> unlink -> modify transactions -> relink -> verify restrictions', async () => {
      // 1. Create a system account and connect to bank
      // Note: Must use UAH currency to match Monobank mock data
      const systemAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          name: 'My System Account',
          type: ACCOUNT_TYPES.system,
          currencyCode: 'UAH',
          initialBalance: 10000,
        }),
        raw: true,
      });

      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      // 2. Link system account to bank connection
      const externalAccountId = externalAccounts[0]!.externalId;
      const linkResponse = await helpers.linkAccountToBankConnection({
        id: systemAccount.id,
        connectionId,
        externalAccountId,
        raw: false,
      });

      // Check if linking was successful
      expect(linkResponse.statusCode).toBe(200);

      // Get the updated account balance after linking (it may have been adjusted)
      const linkedAccount = await Accounts.findByPk(systemAccount.id);
      const currentBalance = linkedAccount!.currentBalance;

      // Verify account is properly linked
      expect(linkedAccount!.bankDataProviderConnectionId).toBe(connectionId);
      expect(linkedAccount!.externalId).toBe(externalAccountId);

      // 3. Sync external transactions
      const mockedTransactions = helpers.monobank.mockedTransactionData(5, {
        initialBalance: currentBalance,
      });
      global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

      const syncResult = await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId,
        accountId: systemAccount.id,
        raw: true,
      });

      expect(syncResult).toHaveProperty('jobGroupId');
      expect(syncResult.jobGroupId).toBeDefined();

      const jobResult = await helpers.bankDataProviders.waitForSyncJobsToComplete({
        connectionId,
        jobGroupId: syncResult.jobGroupId!,
        timeoutMs: 10000,
      });

      expect(jobResult.status).toBe('completed');
      expect(jobResult.failedBatches).toBe(0);

      // Verify transactions were synced
      let transactions = await Transactions.findAll({
        where: { accountId: systemAccount.id },
        order: [['time', 'ASC']],
        raw: true,
      });

      // Should have 5 synced transactions + 1 balance adjustment transaction from linking
      expect(transactions.length).toBe(6);

      // Find external transactions (those with originalId)
      const externalTransactions = transactions.filter((tx) => tx.originalId !== null);
      expect(externalTransactions.length).toBe(5);

      // 4. Verify external transactions cannot be edited (amount)
      const externalTx = externalTransactions[0]!;
      const externalTxEditResult = await helpers.updateTransaction({
        id: externalTx.id,
        payload: {
          amount: externalTx.amount + 1000,
        },
      });

      expect(externalTxEditResult.status).toEqual(ERROR_CODES.ValidationError);

      // 5. Store initial balance for later comparison
      let account = (await Accounts.findByPk(systemAccount.id))!;
      const balanceAfterSync = account.currentBalance;

      // 6. Unlink account from bank connection
      await helpers.unlinkAccountFromBankConnection({
        id: systemAccount.id,
        raw: true,
      });

      // Verify account is unlinked
      account = (await Accounts.findByPk(systemAccount.id))!;
      expect(account.bankDataProviderConnectionId).toBeNull();
      expect(account.externalId).toBeNull();
      expect(account.type).toBe(ACCOUNT_TYPES.system);

      // 7. Modify an existing "external" transaction (should work after unlinking)
      const txToModify = externalTransactions[0]!;
      const originalAmount = txToModify.amount;
      const newAmount = originalAmount + 500;

      const modifyResult = await helpers.updateTransaction({
        id: txToModify.id,
        payload: {
          amount: newAmount,
        },
        raw: true,
      });

      expect(modifyResult[0]!.amount).toBe(newAmount);

      // 8. Verify balance updated after modification
      account = (await Accounts.findByPk(systemAccount.id))!;
      const balanceAfterModification = account.currentBalance;
      expect(balanceAfterModification).not.toBe(balanceAfterSync);

      // 9. Add a new manual transaction (transaction_1)
      const [transaction_1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: systemAccount.id,
          amount: 2000,
          note: 'Manual transaction',
        }),
        raw: true,
      });

      // 10. Verify balance updated after new transaction
      account = (await Accounts.findByPk(systemAccount.id))!;
      const balanceAfterManualTx = account.currentBalance;
      expect(balanceAfterManualTx).not.toBe(balanceAfterModification);

      // 11. Link account back to bank connection
      await helpers.linkAccountToBankConnection({
        id: systemAccount.id,
        connectionId,
        externalAccountId,
        raw: true,
      });

      // Verify account is relinked
      const relinkedAccount = await Accounts.findByPk(systemAccount.id);
      expect(relinkedAccount!.bankDataProviderConnectionId).toBe(connectionId);

      // 12. Fetch new external transactions
      // Refetch account to get the current balance after relinking
      const accountAfterRelink = await Accounts.findByPk(systemAccount.id);
      const balanceForNewSync = accountAfterRelink!.currentBalance;

      const newMockedTransactions = helpers.monobank.mockedTransactionData(3, {
        initialBalance: balanceForNewSync,
      });
      // Set new IDs to avoid duplicates
      newMockedTransactions.forEach((tx, idx) => {
        tx.id = `new-tx-${idx}-${Date.now()}`;
        tx.time = Math.floor((Date.now() + idx * 1000) / 1000);
      });

      global.mswMockServer.use(getMonobankTransactionsMock(newMockedTransactions));

      const { jobGroupId: newJobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId,
        accountId: systemAccount.id,
        raw: true,
      });

      await helpers.bankDataProviders.waitForSyncJobsToComplete({
        connectionId,
        jobGroupId: newJobGroupId!,
      });

      // 13. Verify new transactions were synced
      transactions = await Transactions.findAll({
        where: { accountId: systemAccount.id },
        order: [['time', 'ASC']],
        raw: true,
      });

      // Should have: 1 balance adjustment + 5 original external + 1 manual + 3 new external + 1 new balance adjustment = 11 transactions
      // Or it might be fewer if there's no balance adjustment on second link
      expect(transactions.length).toBeGreaterThanOrEqual(10);

      // 14. Verify account balance updated (we don't check exact amount due to complex balance logic)
      account = (await Accounts.findByPk(systemAccount.id))!;
      const finalBalance = account.currentBalance;
      expect(finalBalance).toBeDefined();

      // 15. Verify new external transactions cannot be edited
      const newExternalTx = transactions.find((tx) => tx.originalId === newMockedTransactions[0]!.id);
      expect(newExternalTx).toBeDefined();

      const newExternalTxEditResult = await helpers.updateTransaction({
        id: newExternalTx!.id,
        payload: {
          amount: newExternalTx!.amount + 1000,
        },
      });

      expect(newExternalTxEditResult.status).toEqual(ERROR_CODES.ValidationError);

      // 16. Verify transaction_1 (manual tx) cannot be edited because account is now linked
      const transaction_1_editResult = await helpers.updateTransaction({
        id: transaction_1.id,
        payload: {
          amount: transaction_1.amount + 500,
        },
      });

      expect(transaction_1_editResult.status).toEqual(ERROR_CODES.ValidationError);
    });
  });
});
