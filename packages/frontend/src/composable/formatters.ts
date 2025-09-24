import { formatUIAmount } from '@/js/helpers';
import { useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';

export const useFormatCurrency = () => {
  const { baseCurrency } = storeToRefs(useCurrenciesStore());

  const formatBaseCurrency = (amount: number) =>
    formatUIAmount(amount, {
      currency: baseCurrency.value?.currency?.code,
    });

  const formatAmountByCurrencyCode = (amount: number, currencyCode: string) =>
    formatUIAmount(amount, {
      currency: currencyCode,
    });

  return {
    formatBaseCurrency,
    formatAmountByCurrencyCode,
  };
};
