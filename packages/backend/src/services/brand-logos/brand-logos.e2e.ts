import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { getLogoDevSearchMock } from '@tests/mocks/logo-dev/mock-api';

// ---------------------------------------------------------------------------
// GET /api/brand-logos/search?q=...  – shared brand-logo search backing the
// payee + subscription logo pickers.
// ---------------------------------------------------------------------------

describe('Brand-logo search', () => {
  describe('GET /brand-logos/search', () => {
    it('returns matching results when the provider returns brands', async () => {
      global.mswMockServer.use(
        getLogoDevSearchMock({
          results: [
            { name: 'Amazon', domain: 'amazon.com', logoUrl: 'https://img.logo.dev/amazon.com' },
            { name: 'Amazon Web Services', domain: 'aws.amazon.com', logoUrl: 'https://img.logo.dev/aws.amazon.com' },
          ],
        }),
      );

      const data = await helpers.searchBrandLogos({ q: 'amazon', raw: true });

      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toMatchObject({
        name: 'Amazon',
        domain: 'amazon.com',
        logoUrl: 'https://img.logo.dev/amazon.com',
      });
      expect(data.results[1]).toMatchObject({
        name: 'Amazon Web Services',
        domain: 'aws.amazon.com',
      });
    });

    it('returns empty results when the provider returns nothing', async () => {
      // Default MSW handler already returns [] – no override needed.
      const data = await helpers.searchBrandLogos({ q: 'xyznonexistentbrand', raw: true });

      expect(data.results).toEqual([]);
    });

    it('returns empty results when q is absent', async () => {
      // The controller short-circuits before calling searchBrands when q is empty / missing.
      const data = await helpers.searchBrandLogos({ raw: true });

      expect(data.results).toEqual([]);
    });

    it('returns empty results when q is an empty string', async () => {
      const data = await helpers.searchBrandLogos({ q: '', raw: true });

      expect(data.results).toEqual([]);
    });
  });
});
