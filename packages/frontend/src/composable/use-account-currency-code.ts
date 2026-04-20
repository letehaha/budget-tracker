import { useCurrenciesStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { type Ref, computed } from 'vue';

export const useAccountCurrencyCode = ({ account }: { account: Ref<AccountModel> }) => {
  const { currenciesMap } = storeToRefs(useCurrenciesStore());

  return computed(() => currenciesMap.value[account.value.currencyCode]?.currency?.code ?? account.value.currencyCode);
};
