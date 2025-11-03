import { describe, expect, it } from '@jest/globals';
import { BankProviderType } from '@services/bank-data-providers';
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
      expect(provider).toHaveProperty('credentialFields');

      // Verify credentialFields structure
      expect(Array.isArray(provider.credentialFields)).toBe(true);
      if (provider.credentialFields.length > 0) {
        expect(provider.credentialFields[0]).toHaveProperty('name');
        expect(provider.credentialFields[0]).toHaveProperty('label');
        expect(provider.credentialFields[0]).toHaveProperty('type');
        expect(provider.credentialFields[0]).toHaveProperty('required');
      }
    });

    it('should include MONOBANK provider in the list', async () => {
      const { providers } = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers',
        raw: true,
      });

      const monobankProvider = providers.find((p) => p.type === BankProviderType.MONOBANK);

      expect(monobankProvider).toBeDefined();
      expect(monobankProvider.name).toBe('Monobank');
      expect(monobankProvider.credentialFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'apiToken',
            type: 'password',
            required: true,
          }),
        ]),
      );
    });
  });
});
