import type { CurrencyModel } from '@bt/shared/types';
import { computed } from 'vue';

import { useAllCurrencies } from './currencies';

const PRIORITY_CURRENCIES = ['USD', 'EUR', 'UAH', 'PLN'];

export function usePrioritizedCurrencies() {
  const { data: allCurrencies } = useAllCurrencies();

  const currencies = computed(() => {
    if (!allCurrencies.value || allCurrencies.value.length === 0) return [];

    const priority: CurrencyModel[] = [];
    const others: CurrencyModel[] = [];

    allCurrencies.value.forEach((currency) => {
      if (PRIORITY_CURRENCIES.includes(currency.code)) {
        priority.push(currency);
      } else {
        others.push(currency);
      }
    });

    priority.sort((a, b) => PRIORITY_CURRENCIES.indexOf(a.code) - PRIORITY_CURRENCIES.indexOf(b.code));

    return [...priority, ...others];
  });

  return { currencies };
}
