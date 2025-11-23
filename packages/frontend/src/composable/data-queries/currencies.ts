import { changeBaseCurrency, getAllCurrencies, loadUserBaseCurrency, setBaseUserCurrency } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import { useCurrenciesStore } from '@/stores';
import { CurrencyModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

/**
 * Query for fetching all system currencies
 */
export const useAllCurrencies = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: getAllCurrencies,
    queryKey: VUE_QUERY_CACHE_KEYS.allCurrencies,
    staleTime: Infinity, // Currencies rarely change
    placeholderData: [] as CurrencyModel[],
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allCurrencies }),
  };
};

/**
 * Query for fetching user's base currency
 */
export const useBaseCurrency = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: loadUserBaseCurrency,
    queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency,
    retry: false,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency }),
  };
};

/**
 * Mutation for setting user's base currency
 */
export const useSetBaseCurrency = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (currencyCode: string) => setBaseUserCurrency(currencyCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.userCurrencies });
    },
  });
};

/**
 * Mutation for changing user's base currency and recalculating all amounts
 */
export const useChangeBaseCurrency = () => {
  const queryClient = useQueryClient();
  const currenciesStore = useCurrenciesStore();

  return useMutation({
    mutationFn: (newCurrencyCode: string) => changeBaseCurrency(newCurrencyCode),
    onSuccess: () => {
      currenciesStore.loadCurrencies();
      currenciesStore.loadBaseCurrency();
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.securityPriceChange] });
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.currencies] });
    },
  });
};
