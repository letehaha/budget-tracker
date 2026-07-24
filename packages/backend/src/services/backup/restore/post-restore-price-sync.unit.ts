import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Stub the config flag so each case toggles self-host vs cloud, and the price
// sync so no DB / data-provider machinery is pulled in through the import graph.
jest.mock('@config/is-self-host', () => ({ __esModule: true, isSelfHost: jest.fn() }));
jest.mock('@services/investments/securities-price/historical-sync.service', () => ({
  __esModule: true,
  syncHistoricalPrices: jest.fn(),
}));
jest.mock('@js/utils', () => ({ __esModule: true, logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

/* eslint-disable import/first */
import { isSelfHost } from '@config/is-self-host';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';

import { triggerPostRestorePriceSync } from './post-restore-price-sync';
/* eslint-enable import/first */

const isSelfHostMock = jest.mocked(isSelfHost);
const syncHistoricalPricesMock = jest.mocked(syncHistoricalPrices);

describe('triggerPostRestorePriceSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncHistoricalPricesMock.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fires one historical sync per id when self-host', () => {
    isSelfHostMock.mockReturnValue(true);

    triggerPostRestorePriceSync({ securityIds: ['sec-1', 'sec-2', 'sec-3'] });

    expect(syncHistoricalPricesMock).toHaveBeenCalledTimes(3);
    expect(syncHistoricalPricesMock).toHaveBeenNthCalledWith(1, 'sec-1');
    expect(syncHistoricalPricesMock).toHaveBeenNthCalledWith(2, 'sec-2');
    expect(syncHistoricalPricesMock).toHaveBeenNthCalledWith(3, 'sec-3');
  });

  it('does nothing on cloud (not self-host)', () => {
    isSelfHostMock.mockReturnValue(false);

    triggerPostRestorePriceSync({ securityIds: ['sec-1', 'sec-2'] });

    expect(syncHistoricalPricesMock).not.toHaveBeenCalled();
  });

  it('does nothing when there are no ids, even on self-host', () => {
    isSelfHostMock.mockReturnValue(true);

    triggerPostRestorePriceSync({ securityIds: [] });

    expect(syncHistoricalPricesMock).not.toHaveBeenCalled();
  });

  it('does not throw when a sync rejects (fire-and-forget swallows rejections)', async () => {
    isSelfHostMock.mockReturnValue(true);
    syncHistoricalPricesMock.mockRejectedValueOnce(new Error('provider down'));

    expect(() => triggerPostRestorePriceSync({ securityIds: ['sec-1'] })).not.toThrow();

    // Let the swallowed rejection settle so an unhandled-rejection can't leak past the test.
    await Promise.resolve();
    expect(syncHistoricalPricesMock).toHaveBeenCalledTimes(1);
  });
});
