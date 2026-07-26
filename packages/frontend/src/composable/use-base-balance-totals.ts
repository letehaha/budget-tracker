import {
  type BalanceAccount,
  type GroupBaseTotal,
  sumAccountsBaseBalance,
} from '@/components/sidebar/accounts-view/helpers/account-totals';
import { useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import { useUserSettings } from './data-queries/user-settings';

/**
 * Every base-currency roll-up needs the same two inputs — the user's base currency and
 * whether credit limits count toward a balance — so this owns both lookups and hands back
 * a summer already bound to them. Callers pass accounts and nothing else.
 *
 * `baseCurrencyCode` comes back too: totals are only renderable once it resolves, so call
 * sites gate their `GroupTotal` on it.
 */
export const useBaseBalanceTotals = () => {
  const { baseCurrency } = storeToRefs(useCurrenciesStore());
  const { data: userSettings } = useUserSettings();

  const baseCurrencyCode = computed(() => baseCurrency.value?.currency?.code);
  const includeCreditLimit = computed(() => !!userSettings.value?.includeCreditLimitInStats);

  const sumBaseBalance = ({ accounts }: { accounts: BalanceAccount[] }): GroupBaseTotal =>
    sumAccountsBaseBalance({
      accounts,
      baseCurrencyCode: baseCurrencyCode.value,
      includeCreditLimit: includeCreditLimit.value,
    });

  return { baseCurrencyCode, includeCreditLimit, sumBaseBalance };
};
