import { AI_PROVIDER, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import {
  INVALID_ANTHROPIC_API_KEY,
  VALID_ANTHROPIC_API_KEY,
  createAnthropicMock,
} from '@tests/mocks/anthropic/mock-api';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { Op } from 'sequelize';

import { DOMAIN_EVENTS, eventBus } from '../common/event-bus';

/**
 * E2E tests for AI Categorization Service
 *
 * These tests verify the complete flow from bank transaction sync
 * to AI-powered automatic categorization.
 */
describe('AI Categorization Service E2E', () => {
  describe('Full categorization flow with Monobank', () => {
    describe('Event integration with bank sync', () => {
      it('should emit TRANSACTIONS_SYNCED event after bank sync to trigger AI categorization', async () => {
        const MOCK_TRANSACTION_COUNT = 3;

        // Spy on event emission
        const eventSpy = jest.spyOn(eventBus, 'emit');

        // Connect to Monobank
        const { connectionId } = await helpers.bankDataProviders.connectProvider({
          providerType: BANK_PROVIDER_TYPE.MONOBANK,
          credentials: { apiToken: VALID_MONOBANK_TOKEN },
          providerName: 'Test Monobank',
          raw: true,
        });

        // List external accounts
        const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
          connectionId,
          raw: true,
        });

        const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

        // Mock Monobank transactions
        global.mswMockServer.use(
          ...accountIds.map((id) =>
            getMonobankTransactionsMock({
              accountId: id,
              response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
            }),
          ),
        );

        // Connect selected accounts (triggers transaction sync)
        await helpers.bankDataProviders.connectSelectedAccounts({
          connectionId,
          accountExternalIds: accountIds,
          raw: true,
        });

        // Wait for async queue processing
        await helpers.sleep(5000);

        // Verify TRANSACTIONS_SYNCED event was emitted (this triggers AI categorization queue)
        expect(eventSpy).toHaveBeenCalledWith(
          DOMAIN_EVENTS.TRANSACTIONS_SYNCED,
          expect.objectContaining({
            userId: expect.any(Number),
            accountId: expect.any(Number),
            transactionIds: expect.arrayContaining([expect.any(Number)]),
          }),
        );

        eventSpy.mockRestore();
      });
    });

    it('should NOT categorize transactions when AI API key is not configured', async () => {
      const MOCK_TRANSACTION_COUNT = 3;

      // Step 1: Create a custom category (but don't set AI API key)
      await helpers.addCustomCategory({
        name: 'Food',
        color: '#FF0000',
        raw: true,
      });

      // Step 2: Connect to Monobank (no AI API key set)
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Monobank No AI',
        raw: true,
      });

      // Step 3: List external accounts
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

      // Step 4: Mock Monobank transactions
      global.mswMockServer.use(
        ...accountIds.map((id) =>
          getMonobankTransactionsMock({
            accountId: id,
            response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
          }),
        ),
      );

      // Step 5: Connect selected accounts (triggers transaction sync)
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // Step 6: Wait for async processing
      await helpers.sleep(5000);

      // Step 7: Verify transactions were synced but NOT AI-categorized
      const transactions = await Transactions.findAll({
        where: {
          accountId: {
            [Op.in]: syncedAccounts.map((i) => i.id),
          },
        },
        raw: true,
      });

      expect(transactions.length).toBe(MOCK_TRANSACTION_COUNT);

      // Transactions should NOT have AI categorization metadata
      for (const tx of transactions) {
        expect(tx.categorizationMeta).toBeNull();
      }
    });

    it('should gracefully handle AI API errors without failing transaction sync', async () => {
      const MOCK_TRANSACTION_COUNT = 3;

      // Step 1: Create a custom category
      await helpers.addCustomCategory({
        name: 'Transport',
        color: '#0000FF',
        raw: true,
      });

      // Step 2: Set up AI API key
      await helpers.setAiApiKey({
        apiKey: VALID_ANTHROPIC_API_KEY,
        provider: AI_PROVIDER.anthropic,
        raw: true,
      });

      // Step 3: Connect to Monobank
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Monobank Error',
        raw: true,
      });

      // Step 4: List external accounts
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

      // Step 5: Mock Monobank transactions
      global.mswMockServer.use(
        ...accountIds.map((id) =>
          getMonobankTransactionsMock({
            accountId: id,
            response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
          }),
        ),
      );

      // Step 6: Set up Anthropic mock to FAIL
      global.mswMockServer.use(createAnthropicMock({ shouldFail: true, errorStatus: 500 }));

      // Step 7: Connect selected accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // Step 8: Wait for async processing
      await helpers.sleep(5000);

      // Step 9: Transactions should still be synced even if AI categorization failed
      const transactions = await Transactions.findAll({
        where: {
          accountId: {
            [Op.in]: syncedAccounts.map((i) => i.id),
          },
        },
        raw: true,
      });

      expect(transactions.length).toBe(MOCK_TRANSACTION_COUNT);

      // Transactions should NOT have AI categorization metadata (due to error)
      for (const tx of transactions) {
        expect(tx.categorizationMeta).toBeNull();
      }
    });

    it('should handle invalid AI API key gracefully', async () => {
      const MOCK_TRANSACTION_COUNT = 2;

      // Step 1: Create a custom category
      await helpers.addCustomCategory({
        name: 'Entertainment',
        color: '#FFFF00',
        raw: true,
      });

      // Step 2: Set up INVALID AI API key
      await helpers.setAiApiKey({
        apiKey: INVALID_ANTHROPIC_API_KEY,
        provider: AI_PROVIDER.anthropic,
        raw: true,
      });

      // Step 3: Connect to Monobank
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Monobank Invalid Key',
        raw: true,
      });

      // Step 4: List external accounts
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.slice(0, 1).map((acc: { externalId: string }) => acc.externalId);

      // Step 5: Mock Monobank transactions
      global.mswMockServer.use(
        ...accountIds.map((id) =>
          getMonobankTransactionsMock({
            accountId: id,
            response: helpers.monobank.mockedTransactionData(MOCK_TRANSACTION_COUNT),
          }),
        ),
      );

      // Step 6: Connect selected accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // Step 7: Wait for async processing
      await helpers.sleep(5000);

      // Step 8: Transactions should be synced despite AI auth error
      const transactions = await Transactions.findAll({
        where: {
          accountId: {
            [Op.in]: syncedAccounts.map((i) => i.id),
          },
        },
        raw: true,
      });

      expect(transactions.length).toBe(MOCK_TRANSACTION_COUNT);

      // Transactions should NOT have AI categorization (auth failed)
      for (const tx of transactions) {
        expect(tx.categorizationMeta).toBeNull();
      }
    });
  });

  describe('AI API Key management', () => {
    it('should allow setting and retrieving AI API key status', async () => {
      // Initially no key set
      const initialStatus = await helpers.getAiApiKeyStatus({ raw: true });
      expect(initialStatus.hasApiKey).toBe(false);

      // Set API key
      await helpers.setAiApiKey({
        apiKey: VALID_ANTHROPIC_API_KEY,
        provider: AI_PROVIDER.anthropic,
        raw: true,
      });

      // Verify key is set
      const afterStatus = await helpers.getAiApiKeyStatus({ raw: true });
      expect(afterStatus.hasApiKey).toBe(true);
      expect(afterStatus.providers.some((p: { provider: string }) => p.provider === AI_PROVIDER.anthropic)).toBe(true);
    });

    it('should allow deleting AI API key', async () => {
      // Set API key
      await helpers.setAiApiKey({
        apiKey: VALID_ANTHROPIC_API_KEY,
        provider: AI_PROVIDER.anthropic,
        raw: true,
      });

      // Verify key is set
      const statusBefore = await helpers.getAiApiKeyStatus({ raw: true });
      expect(statusBefore.hasApiKey).toBe(true);

      // Delete key
      await helpers.deleteAiApiKey({
        provider: AI_PROVIDER.anthropic,
        raw: true,
      });

      // Verify key is deleted
      const statusAfter = await helpers.getAiApiKeyStatus({ raw: true });
      expect(statusAfter.providers.some((p: { provider: string }) => p.provider === AI_PROVIDER.anthropic)).toBe(false);
    });
  });
});
