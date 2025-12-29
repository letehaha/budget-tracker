import { formatLargeNumber, formatUIAmount } from '@/js/helpers';
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

  /**
   * Compact format for sidebar/overview display:
   * - < 10k: show with cents (e.g., "UAH 9,999.99")
   * - >= 10k: show with k/M suffix (e.g., "UAH 26.00k", "UAH 1.23M")
   */
  const formatCompactAmount = (amount: number, currencyCode: string) => {
    const abs = Math.abs(amount);

    if (abs >= 10_000) {
      // Use k/M/B suffixes for 10k+
      return formatLargeNumber(amount, {
        currency: currencyCode,
        isFiat: true,
        thousandThreshold: 10_000,
        millionThreshold: 1_000_000,
        maximumFractionDigits: 2,
        minimumFractionDigits: abs >= 100_000 ? 0 : 2, // Less precision for larger numbers
      });
    }
    // Normal format with cents for < 10k
    return formatUIAmount(amount, { currency: currencyCode });
  };

  return {
    formatBaseCurrency,
    formatAmountByCurrencyCode,
    formatCompactAmount,
  };
};
