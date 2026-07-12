import { computeAccountDisplayBalances } from '@/common/utils/account-balance';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { AccountModel } from '@bt/shared/types';
import { type Ref, computed } from 'vue';

/**
 * Returns credit-limit-adjusted balance values for an account
 * based on the user's `includeCreditLimitInStats` setting.
 */
export const useAccountDisplayBalance = ({ account }: { account: Ref<AccountModel> }) => {
  const { data: userSettings } = useUserSettings();

  const balances = computed(() =>
    computeAccountDisplayBalances({
      currentBalance: account.value.currentBalance,
      refCurrentBalance: account.value.refCurrentBalance,
      creditLimit: account.value.creditLimit,
      includeCreditLimit: !!userSettings.value?.includeCreditLimitInStats,
    }),
  );

  const hasCreditLimitAdjustment = computed(() => balances.value.hasCreditLimitAdjustment);
  const displayBalance = computed(() => balances.value.displayBalance);
  const displayRefBalance = computed(() => balances.value.displayRefBalance);

  return { hasCreditLimitAdjustment, displayBalance, displayRefBalance };
};
