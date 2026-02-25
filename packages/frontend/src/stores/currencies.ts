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

  const loadCurrencies = async () => {
    const [userCurrencies, systemOnes] = await Promise.all([loadUserCurrencies(), getAllCurrencies()]);

    currencies.value = userCurrencies;
    systemCurrencies.value = systemOnes;
  };

  const getCurrency = (currencyCode: string) =>
    currencies.value.find((currency) => currency.currencyCode === currencyCode);

  const loadBaseCurrency = async () => {
    const result = await loadUserBaseCurrency();

    if (result) {
      baseCurrency.value = result;

      if (!currencies.value.find((item) => item.id === result.id)) {
        currencies.value.push(result);
      }
    }
  };

  const setBaseCurrency = async (currencyCode: string) => {
    const result: UserCurrencyModel = await setBaseUserCurrency(currencyCode);

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
