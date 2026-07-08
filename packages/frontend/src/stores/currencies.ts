import { getAllCurrencies, loadUserBaseCurrency, loadUserCurrencies } from '@/api/currencies';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { queryClient } from '@/lib/query-client';
import { CurrencyModel, UserCurrencyModel } from '@bt/shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useCurrenciesStore = defineStore('currencies', () => {
  const systemCurrencies = ref<CurrencyModel[]>([]);
  const currencies = ref<UserCurrencyModel[]>([]);
  const baseCurrency = ref<UserCurrencyModel | null>(null);
  const isBaseCurrencyExists = computed(() => Boolean(baseCurrency.value));

  const systemCurrenciesVerbose = computed<{
    linked: CurrencyModel[];
    unlinked: CurrencyModel[];
  }>(() =>
    systemCurrencies.value.reduce(
      (acc, curr) => {
        if (currencies.value.find((item) => item.currencyCode === curr.code)) {
          acc.linked.push(curr);
        } else {
          acc.unlinked.push(curr);
        }
        return acc;
      },
      { linked: [] as CurrencyModel[], unlinked: [] as CurrencyModel[] },
    ),
  );

  const currenciesMap = computed(() =>
    currencies.value.reduce(
      (acc, curr) => {
        acc[curr.currencyCode] = curr;
        return acc;
      },
      {} as Record<string, UserCurrencyModel>,
    ),
  );

  // Both fetches run through the vue-query cache (staleTime Infinity) so they dedupe on
  // init and can be persisted/invalidated by key. `force` marks the cached entries stale
  // first, so post-mutation reloads pull fresh data instead of returning the cache.
  const loadCurrencies = async ({ force = false }: { force?: boolean } = {}) => {
    if (force) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.userCurrencies }),
        queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.allCurrencies }),
      ]);
    }

    const [userCurrencies, systemOnes] = await Promise.all([
      queryClient.ensureQueryData({
        queryKey: VUE_QUERY_CACHE_KEYS.userCurrencies,
        queryFn: loadUserCurrencies,
        staleTime: Infinity,
      }),
      queryClient.ensureQueryData({
        queryKey: VUE_QUERY_CACHE_KEYS.allCurrencies,
        queryFn: getAllCurrencies,
        staleTime: Infinity,
      }),
    ]);

    currencies.value = userCurrencies;
    systemCurrencies.value = systemOnes;
  };

  const getCurrency = (currencyCode: string) =>
    currencies.value.find((currency) => currency.currencyCode === currencyCode);

  const loadBaseCurrency = async ({ force = false }: { force?: boolean } = {}) => {
    if (force) {
      await queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency });
    }

    const result = await queryClient.ensureQueryData({
      queryKey: VUE_QUERY_CACHE_KEYS.baseCurrency,
      queryFn: loadUserBaseCurrency,
      staleTime: Infinity,
    });

    if (result) {
      baseCurrency.value = result;

      if (!currencies.value.find((item) => item.id === result.id)) {
        currencies.value.push(result);
      }
    }
  };

  return {
    currencies,
    baseCurrency,
    systemCurrencies,
    currenciesMap,
    systemCurrenciesVerbose,
    isBaseCurrencyExists,
    loadCurrencies,
    loadBaseCurrency,
    getCurrency,
  };
});
