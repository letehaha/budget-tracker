import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
import { addDays, subDays } from 'date-fns';

describe('GET /investments/prices', () => {
  it('serves prices filtered by date range', async () => {
    const invertedRange = await helpers.getSecuritiesPricesByDate({
      params: { from: addDays(new Date(), 5), to: new Date() },
    });

    expect(invertedRange.statusCode).toEqual(ERROR_CODES.ValidationError);

    const security = await Securities.create({
      symbol: 'RANGEHIT',
      providerSymbol: 'RANGEHIT',
      currencyCode: 'USD',
      providerName: SECURITY_PROVIDER.fmp,
      assetClass: ASSET_CLASS.stocks,
      name: 'Range Hit Test Security',
    });

    const emptyRangePrices = await helpers.getSecuritiesPricesByDate({
      params: { securityId: security.id, from: subDays(new Date(), 10), to: new Date() },
      raw: true,
    });

    expect(emptyRangePrices).toEqual([]);

    await SecurityPricing.create({ securityId: security.id, date: subDays(new Date(), 2), priceClose: '100' });
    await SecurityPricing.create({ securityId: security.id, date: subDays(new Date(), 30), priceClose: '200' });

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
  }, 30000);
});
