import type { CurrencyModel, UserCurrencyModel } from '@bt/shared/types';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrenciesStore } from './currencies';

const { api } = vi.hoisted(() => ({
  api: { getAllCurrencies: vi.fn(), loadUserCurrencies: vi.fn(), loadUserBaseCurrency: vi.fn() },
}));

vi.mock('@/api/currencies', () => api);

vi.mock('@/lib/query-client', () => ({
  invalidatePersistedQuery: vi.fn(),
  queryClient: { fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn() },
}));

const system = (code: string) => ({ code }) as CurrencyModel;
const linked = ({ id, code }: { id: number; code: string }) =>
  ({ id, currencyCode: code }) as unknown as UserCurrencyModel;

describe('currencies store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.getAllCurrencies.mockResolvedValue(['AED', 'EUR', 'GEL', 'UAH', 'USD'].map(system));
    api.loadUserCurrencies.mockResolvedValue([linked({ id: 1, code: 'USD' }), linked({ id: 2, code: 'EUR' })]);
  });

  it('lists linked currencies first and keeps the original order inside each group', async () => {
    const store = useCurrenciesStore();

    await store.loadCurrencies();

    expect(store.systemCurrencies.map((item) => item.code)).toEqual(['EUR', 'USD', 'AED', 'GEL', 'UAH']);
  });

  it('moves a base currency linked outside loadCurrencies to the front', async () => {
    const store = useCurrenciesStore();
    await store.loadCurrencies();
    api.loadUserBaseCurrency.mockResolvedValue(linked({ id: 3, code: 'UAH' }));

    await store.loadBaseCurrency();

    expect(store.systemCurrencies.map((item) => item.code)).toEqual(['EUR', 'USD', 'UAH', 'AED', 'GEL']);
  });
});
