import { subDays } from 'date-fns';
import { vi } from 'vitest';

import { toProviderSymbol } from './base-provider';

// `mock`-prefixed so Vitest's hoisted `vi.mock` factory may reference it.
const mockDaily = vi.fn<(symbol: string, outputsize?: string) => Promise<unknown>>();

vi.mock('alphavantage', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    data: { daily: mockDaily },
  })),
}));

// Imported after the mock so the provider's constructor picks up the stub.
import { AlphaVantageDataProvider } from './alphavantage-provider';

describe('AlphaVantageDataProvider.getHistoricalPrices outputsize', () => {
  const provider = new AlphaVantageDataProvider('test-key');
  const symbol = toProviderSymbol('IBM');

  beforeEach(() => {
    mockDaily.mockReset();
    // Minimal valid TIME_SERIES_DAILY payload so the method doesn't throw.
    mockDaily.mockResolvedValue({
      'Time Series (Daily)': { '2026-05-28': { '4. close': '10.00' } },
    });
  });

  it('requests `compact` for a recent date range (free-tier safe, avoids 402)', async () => {
    const now = new Date();
    await provider.getHistoricalPrices(symbol, { startDate: subDays(now, 1), endDate: now });

    expect(mockDaily).toHaveBeenCalledWith(symbol, 'compact');
  });

  it('requests `compact` at the edge of the compact window (100 days)', async () => {
    const now = new Date();
    await provider.getHistoricalPrices(symbol, { startDate: subDays(now, 100), endDate: subDays(now, 99) });

    expect(mockDaily).toHaveBeenCalledWith(symbol, 'compact');
  });

  it('requests `full` when the start date is older than the compact window', async () => {
    const now = new Date();
    await provider.getHistoricalPrices(symbol, { startDate: subDays(now, 200), endDate: subDays(now, 199) });

    expect(mockDaily).toHaveBeenCalledWith(symbol, 'full');
  });

  it('requests `full` when no start date is given (backfill needs full history)', async () => {
    await provider.getHistoricalPrices(symbol);

    expect(mockDaily).toHaveBeenCalledWith(symbol, 'full');
  });
});
