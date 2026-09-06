import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Bank Data Providers controller', () => {
  describe('GET /api/bank-data-providers', () => {
    it('should return list of available providers for authenticated user', async () => {
      const { providers } = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers',
        raw: true,
      });

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      // Verify provider structure
      const provider = providers[0];
      expect(provider).toHaveProperty('type');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('description');
      expect(provider).toHaveProperty('features');
    });

    it('should include MONOBANK provider in the list', async () => {
      const { providers } = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers',
        raw: true,
      });

      const monobankProvider = providers.find((p) => p.type === BANK_PROVIDER_TYPE.MONOBANK);

      expect(monobankProvider).toBeDefined();
      expect(monobankProvider.name).toBe('Monobank');
    });

    it('should expose the configured Enable Banking redirect URL so the UI can show what to register', async () => {
      const previous = process.env.ENABLE_BANKING_REDIRECT_URL;
      process.env.ENABLE_BANKING_REDIRECT_URL = 'https://budget.example.test/bank-callback';

      try {
        const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });
        const provider = providers.find((p) => p.type === BANK_PROVIDER_TYPE.ENABLE_BANKING);

        expect(provider).toBeDefined();
        expect(provider!.redirectUrl).toBe('https://budget.example.test/bank-callback');
      } finally {
        process.env.ENABLE_BANKING_REDIRECT_URL = previous;
      }
    });
  });
});
