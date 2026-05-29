import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('List Venture Platforms Service E2E', () => {
  describe('GET /venture/platforms', () => {
    it('returns empty list when user has no platforms', async () => {
      const response = await helpers.listVenturePlatforms({});
      expect(response.statusCode).toBe(200);

      const body = helpers.extractResponse(response);
      expect(body.data).toEqual([]);
      expect(body.pagination).toMatchObject({ limit: 20, offset: 0, page: 1 });
    });

    it('returns created platforms (newest first)', async () => {
      await helpers.createVenturePlatform({ payload: { name: 'Platform A' } });
      await helpers.createVenturePlatform({ payload: { name: 'Platform B' } });
      await helpers.createVenturePlatform({ payload: { name: 'Platform C' } });

      const body = await helpers.listVenturePlatforms({ raw: true });
      expect(body.data).toHaveLength(3);
      expect(body.data.map((p) => p.name)).toEqual(['Platform C', 'Platform B', 'Platform A']);
    });

    it('respects pagination limit + offset', async () => {
      for (let i = 0; i < 5; i++) {
        await helpers.createVenturePlatform({ payload: { name: `P${i}` } });
      }

      const page1 = await helpers.listVenturePlatforms({ limit: 2, offset: 0, raw: true });
      const page2 = await helpers.listVenturePlatforms({ limit: 2, offset: 2, raw: true });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.data[0]!.name).not.toBe(page2.data[0]!.name);
    });

    it('rejects limit over 100', async () => {
      const response = await helpers.listVenturePlatforms({ limit: 999 });
      expect(response.statusCode).not.toBe(200);
    });
  });
});
