import { VENTURE_DEAL_STATUS, VENTURE_SPV_SUBTYPE, VENTURE_VEHICLE_TYPE } from '@bt/shared/types/venture';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Create Venture Deal Service E2E', () => {
  describe('POST /venture/deals', () => {
    it('creates a deal with full payload', async () => {
      const response = await helpers.createVentureDeal({
        payload: helpers.buildVentureDealPayload({
          name: 'SK 116',
          targetCompany: 'Founder Factor YC W26',
          spvSubtype: VENTURE_SPV_SUBTYPE.multi_company,
          notes: 'Acme Ventures syndicate',
        }),
      });

      expect(response.statusCode).toBe(200);

      const deal = helpers.extractResponse(response);
      expect(deal).toMatchObject({
        name: 'SK 116',
        currencyCode: 'USD',
        vehicleType: VENTURE_VEHICLE_TYPE.spv,
        spvSubtype: VENTURE_SPV_SUBTYPE.multi_company,
        status: VENTURE_DEAL_STATUS.outstanding,
        targetCompany: 'Founder Factor YC W26',
        notes: 'Acme Ventures syndicate',
      });
      expect(Number(deal.principal)).toBe(16000);
      // entryFee auto-computed = principal * entryFeePct = 16000 * 0.085 = 1360
      expect(Number(deal.entryFee)).toBeCloseTo(1360, 2);
    });

    it('inherits platform fee defaults when platformId provided', async () => {
      const platform = await helpers.createVenturePlatform({
        payload: { name: 'Acme Ventures', defaultEntryFeePct: '0.085', defaultCarryPct: '0.2', defaultHurdlePct: '0' },
        raw: true,
      });

      const deal = await helpers.createVentureDeal({
        payload: {
          name: 'Deal w/ platform',
          platformId: platform.id,
          principal: '10000',
          entryFeePct: undefined,
          carryPct: undefined,
          hurdlePct: undefined,
          mgmtFeePct: undefined,
        },
        raw: true,
      });

      expect(Number(deal.entryFeePct)).toBe(0.085);
      expect(Number(deal.carryPct)).toBe(0.2);
      expect(deal.platformId).toBe(platform.id);
      // entryFee snapshot = 10000 * 0.085 = 850
      expect(Number(deal.entryFee)).toBeCloseTo(850, 2);
    });

    it('user-provided entryFee overrides auto-computed value', async () => {
      const deal = await helpers.createVentureDeal({
        payload: {
          name: 'Custom fee',
          principal: '10000',
          entryFeePct: '0.085',
          entryFee: '2000',
        },
        raw: true,
      });

      expect(Number(deal.entryFee)).toBe(2000);
    });

    it('rejects empty name', async () => {
      const response = await helpers.createVentureDeal({ payload: { name: '' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects negative principal', async () => {
      const response = await helpers.createVentureDeal({ payload: { principal: '-100' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects unknown currency', async () => {
      const response = await helpers.createVentureDeal({ payload: { currencyCode: 'ZZZ' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects unknown platformId', async () => {
      const response = await helpers.createVentureDeal({
        payload: { platformId: generateRandomRecordId() },
      });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('rejects malformed investmentDate', async () => {
      const response = await helpers.createVentureDeal({ payload: { investmentDate: '03/24/2026' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects pct outside 0..1 range', async () => {
      const response = await helpers.createVentureDeal({ payload: { carryPct: '1.5' } });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('trims deal name', async () => {
      const deal = await helpers.createVentureDeal({ payload: { name: '  Padded  ' }, raw: true });
      expect(deal.name).toBe('Padded');
    });
  });
});
