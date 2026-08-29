import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Venture Platforms E2E', () => {
  describe('POST /venture/platforms', () => {
    it('creates a platform with all fields', async () => {
      const response = await helpers.createVenturePlatform({
        payload: helpers.buildVenturePlatformPayload({
          name: '  Acme Ventures  ',
          website: 'https://acme.example',
          description: 'YC W26 syndicate',
          defaultEntryFeePct: '0.085',
          defaultCarryPct: '0.2',
          defaultHurdlePct: '0',
          defaultMgmtFeePct: '0',
        }),
      });

      expect(response.statusCode).toBe(200);

      const platform = helpers.extractResponse(response);
      expect(platform).toMatchObject({
        name: 'Acme Ventures',
        website: 'https://acme.example',
        description: 'YC W26 syndicate',
      });
      expect(Number(platform.defaultEntryFeePct)).toBe(0.085);
      expect(Number(platform.defaultCarryPct)).toBe(0.2);
      expect(Number(platform.defaultHurdlePct)).toBe(0);
      expect(Number(platform.defaultMgmtFeePct)).toBe(0);
    });

    it('creates with minimal payload (defaults applied)', async () => {
      const platform = await helpers.createVenturePlatform({
        payload: {
          name: 'Minimal Platform',
          defaultEntryFeePct: undefined,
          defaultCarryPct: undefined,
          defaultHurdlePct: undefined,
          defaultMgmtFeePct: undefined,
          website: null,
          description: null,
        },
        raw: true,
      });

      expect(platform.name).toBe('Minimal Platform');
      expect(platform.website).toBeNull();
      expect(platform.description).toBeNull();
    });

    it('rejects duplicate name for same user', async () => {
      const first = await helpers.createVenturePlatform({
        payload: { name: 'Duplicate Co' },
      });
      expect(first.statusCode).toBe(200);

      const second = await helpers.createVenturePlatform({
        payload: { name: 'Duplicate Co' },
      });
      expect(second.statusCode).toBe(ERROR_CODES.ConflictError);
    });
  });

  describe('GET /venture/platforms/:id', () => {
    it('returns platform for owner', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Owned VC' },
        raw: true,
      });

      const response = await helpers.getVenturePlatform({ platformId: created.id });
      expect(response.statusCode).toBe(200);

      const platform = helpers.extractResponse(response);
      expect(platform.id).toBe(created.id);
      expect(platform.name).toBe('Owned VC');
    });

    it('returns 404 for nonexistent id', async () => {
      const response = await helpers.getVenturePlatform({ platformId: generateRandomRecordId() });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('GET /venture/platforms', () => {
    it('returns empty list when user has no platforms', async () => {
      const response = await helpers.listVenturePlatforms({});
      expect(response.statusCode).toBe(200);

      const body = helpers.extractResponse(response);
      expect(body.data).toEqual([]);
      expect(body.pagination).toMatchObject({ limit: 20, offset: 0, page: 1 });
    });

    it('returns created platforms newest first and respects limit + offset', async () => {
      await helpers.createVenturePlatform({ payload: { name: 'Platform A' } });
      await helpers.createVenturePlatform({ payload: { name: 'Platform B' } });
      await helpers.createVenturePlatform({ payload: { name: 'Platform C' } });

      const body = await helpers.listVenturePlatforms({ raw: true });
      expect(body.data).toHaveLength(3);
      expect(body.data.map((p) => p.name)).toEqual(['Platform C', 'Platform B', 'Platform A']);

      const page1 = await helpers.listVenturePlatforms({ limit: 2, offset: 0, raw: true });
      const page2 = await helpers.listVenturePlatforms({ limit: 2, offset: 2, raw: true });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(1);
      expect(page1.data[0]!.name).not.toBe(page2.data[0]!.name);
    }, 30_000);
  });

  describe('PUT /venture/platforms/:id', () => {
    it('updates name + fees, then clears nullable fields when set to null', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Old Name', defaultCarryPct: '0.2', website: 'https://x.io', description: 'foo' },
        raw: true,
      });

      const updated = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: { name: 'New Name', defaultCarryPct: '0.25' },
        raw: true,
      });

      expect(updated.name).toBe('New Name');
      expect(Number(updated.defaultCarryPct)).toBe(0.25);

      const cleared = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: { website: null, description: null },
        raw: true,
      });

      expect(cleared.website).toBeNull();
      expect(cleared.description).toBeNull();
    });

    it('returns 404 for nonexistent id', async () => {
      const response = await helpers.updateVenturePlatform({
        platformId: generateRandomRecordId(),
        payload: { name: 'Anything' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects empty body', async () => {
      const created = await helpers.createVenturePlatform({ raw: true });

      const response = await helpers.updateVenturePlatform({
        platformId: created.id,
        payload: {},
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects rename to a name owned by another platform but allows renaming to its own name', async () => {
      const existing = await helpers.createVenturePlatform({ payload: { name: 'Existing' }, raw: true });
      const second = await helpers.createVenturePlatform({
        payload: { name: 'Different' },
        raw: true,
      });

      const conflict = await helpers.updateVenturePlatform({
        platformId: second.id,
        payload: { name: 'Existing' },
      });
      expect(conflict.statusCode).toBe(ERROR_CODES.ConflictError);

      const selfRename = await helpers.updateVenturePlatform({
        platformId: existing.id,
        payload: { name: 'Existing' },
      });
      expect(selfRename.statusCode).toBe(200);
    });
  });

  describe('DELETE /venture/platforms/:id', () => {
    it('soft-deletes a platform and frees its name for reuse', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Reusable Name' },
        raw: true,
      });

      const deleteResponse = await helpers.deleteVenturePlatform({ platformId: created.id });
      expect(deleteResponse.statusCode).toBe(200);

      // Sequelize paranoid hides the soft-deleted row from GET.
      const getResponse = await helpers.getVenturePlatform({ platformId: created.id });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

      const list = await helpers.listVenturePlatforms({ raw: true });
      expect(list.data.find((p) => p.id === created.id)).toBeUndefined();

      const reused = await helpers.createVenturePlatform({
        payload: { name: 'Reusable Name' },
      });
      expect(reused.statusCode).toBe(200);
    });

    it('hard-deletes when force=true', async () => {
      const created = await helpers.createVenturePlatform({
        payload: { name: 'Force Delete' },
        raw: true,
      });

      const response = await helpers.deleteVenturePlatform({
        platformId: created.id,
        force: true,
      });
      expect(response.statusCode).toBe(200);

      const getResponse = await helpers.getVenturePlatform({ platformId: created.id });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('is idempotent on nonexistent id', async () => {
      const response = await helpers.deleteVenturePlatform({
        platformId: generateRandomRecordId(),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('request validation', () => {
    it('rejects invalid platform payloads', async () => {
      const emptyName = await helpers.createVenturePlatform({ payload: { name: '' } });
      expect(emptyName.statusCode).toBe(ERROR_CODES.ValidationError);

      const tooLongName = await helpers.createVenturePlatform({ payload: { name: 'a'.repeat(256) } });
      expect(tooLongName.statusCode).toBe(ERROR_CODES.ValidationError);

      const invalidWebsite = await helpers.createVenturePlatform({ payload: { website: 'not-a-url' } });
      expect(invalidWebsite.statusCode).toBe(ERROR_CODES.ValidationError);

      const outOfRangePct = await helpers.createVenturePlatform({ payload: { defaultCarryPct: '1.5' } });
      expect(outOfRangePct.statusCode).toBe(ERROR_CODES.ValidationError);

      const oversizedLimit = await helpers.listVenturePlatforms({ limit: 999 });
      expect(oversizedLimit.statusCode).not.toBe(200);
    }, 30_000);

    it('rejects malformed platform id', async () => {
      const get = await helpers.getVenturePlatform({ platformId: 'not-a-uuid' });
      expect(get.statusCode).toBe(ERROR_CODES.ValidationError);

      const remove = await helpers.deleteVenturePlatform({ platformId: 'not-a-uuid' });
      expect(remove.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
