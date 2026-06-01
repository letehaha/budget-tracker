import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create Venture Platform Service E2E', () => {
  describe('POST /venture/platforms', () => {
    it('creates a platform with all fields', async () => {
      const response = await helpers.createVenturePlatform({
        payload: helpers.buildVenturePlatformPayload({
          name: 'Acme Ventures',
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

    it('trims platform name', async () => {
      const platform = await helpers.createVenturePlatform({
        payload: { name: '  Padded VC  ' },
        raw: true,
      });
      expect(platform.name).toBe('Padded VC');
    });

    it('rejects empty name', async () => {
      const response = await helpers.createVenturePlatform({
        payload: { name: '' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects name over 255 characters', async () => {
      const response = await helpers.createVenturePlatform({
        payload: { name: 'a'.repeat(256) },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects invalid website URL', async () => {
      const response = await helpers.createVenturePlatform({
        payload: { website: 'not-a-url' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects pct outside 0..1', async () => {
      const response = await helpers.createVenturePlatform({
        payload: { defaultCarryPct: '1.5' },
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
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
});
