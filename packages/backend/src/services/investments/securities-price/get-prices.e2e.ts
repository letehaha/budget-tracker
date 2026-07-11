import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
import { addDays, subDays } from 'date-fns';

describe('GET /investments/prices', () => {
  it('rejects when `from` is after `to`', async () => {
    const response = await helpers.getSecuritiesPricesByDate({
      params: { from: addDays(new Date(), 5), to: new Date() },
    });

    expect(response.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('returns an empty array when no prices exist in the requested range', async () => {
    const security = await Securities.create({
      symbol: 'EMPTYRANGE',
      providerSymbol: 'EMPTYRANGE',
      currencyCode: 'USD',
      providerName: SECURITY_PROVIDER.fmp,
      assetClass: ASSET_CLASS.stocks,
      name: 'Empty Range Test Security',
    });

    const prices = await helpers.getSecuritiesPricesByDate({
      params: {
        securityId: security.id,
        from: subDays(new Date(), 10),
        to: new Date(),
      },
      raw: true,
    });

    expect(prices).toEqual([]);
  });

  it('returns only prices within the requested date range', async () => {
    const security = await Securities.create({
      symbol: 'RANGEHIT',
      providerSymbol: 'RANGEHIT',
      currencyCode: 'USD',
      providerName: SECURITY_PROVIDER.fmp,
      assetClass: ASSET_CLASS.stocks,
      name: 'Range Hit Test Security',
    });

    const inRangeDate = subDays(new Date(), 2);
    const outOfRangeDate = subDays(new Date(), 30);

    await SecurityPricing.create({
      securityId: security.id,
      date: inRangeDate,
      priceClose: '100',
    });
    await SecurityPricing.create({
      securityId: security.id,
      date: outOfRangeDate,
      priceClose: '200',
    });

    const prices = await helpers.getSecuritiesPricesByDate({
      params: {
        securityId: security.id,
        from: subDays(new Date(), 5),
        to: new Date(),
      },
      raw: true,
    });

    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ securityId: security.id, priceClose: 100 });
  });
});
