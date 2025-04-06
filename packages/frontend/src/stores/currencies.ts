import { getAllCurrencies, loadUserBaseCurrency, loadUserCurrencies, setBaseUserCurrency } from '@/api/currencies';
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
        if (currencies.value.find((item) => item.currencyId === curr.id)) {
          acc.linked.push(curr);
        } else {
          acc.unlinked.push(curr);
        }
        return acc;
      },
      { linked: [], unlinked: [] },
    ),
  );

  const currenciesMap = computed(() =>
    currencies.value.reduce(
      (acc, curr) => {
        acc[curr.currencyId] = curr;
        return acc;
      },
      {} as Record<number, UserCurrencyModel>,
    ),
  );

  const loadCurrencies = async () => {
    const [userCurrencies, systemOnes] = await Promise.all([loadUserCurrencies(), getAllCurrencies()]);

    currencies.value = userCurrencies;
    systemCurrencies.value = systemOnes;
  };

  const getCurrency = (currencyId: number) => currencies.value.find((currency) => currency.currencyId === currencyId);

  const loadBaseCurrency = async () => {
    const result = await loadUserBaseCurrency();

    if (result) {
      baseCurrency.value = result;

      if (!currencies.value.find((item) => item.id === result.id)) {
        currencies.value.push(result);
      }
    }
  };

  const setBaseCurrency = async (currencyId: number) => {
    const result: UserCurrencyModel = await setBaseUserCurrency(currencyId);

    if (result) {
      baseCurrency.value = result;
      currencies.value.push(result);
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
    setBaseCurrency,
    getCurrency,
  };
});
