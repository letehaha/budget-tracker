import { formatUIAmount } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';

export const useFormatCurrency = () => {
  const { currenciesMap, baseCurrency } = storeToRefs(useCurrenciesStore());

  const formatBaseCurrency = (amount: number) =>
    formatUIAmount(amount, {
      currency: baseCurrency.value?.currency?.code,
    });

  const formatAmountByCurrencyId = (amount: number, currencyId: number) =>
    formatUIAmount(amount, {
      currency: currenciesMap.value?.[currencyId]?.currency?.code,
    });

  return {
    formatBaseCurrency,
    formatAmountByCurrencyId,
  };
};
