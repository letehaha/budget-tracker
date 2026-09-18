import type { SelectPinnedGroup } from '@/components/fields/utils/select-sections';
import { useCurrenciesStore } from '@/stores/currencies';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/** Splits a currency picker into the user's own currencies and the rest. */
export const useLinkedCurrencyGroup = () => {
  const { t } = useI18n();
  const { currenciesMap } = storeToRefs(useCurrenciesStore());

  return computed<SelectPinnedGroup<{ code: string }>>(() => ({
    isPinned: (item) => Boolean(currenciesMap.value[item.code]),
    pinnedLabel: t('fields.currencySelect.yourCurrencies'),
    restLabel: t('fields.currencySelect.otherCurrencies'),
  }));
};
