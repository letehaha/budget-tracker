import { useUserSettings } from '@/composable/data-queries/user-settings';
import { AccountModel } from '@bt/shared/types';
import { type Ref, computed } from 'vue';

/**
 * Returns credit-limit-adjusted balance values for an account
 * based on the user's `includeCreditLimitInStats` setting.
 */
export const useAccountDisplayBalance = ({ account }: { account: Ref<AccountModel> }) => {
  const { data: userSettings } = useUserSettings();

  const hasCreditLimitAdjustment = computed(
    () => !!userSettings.value?.includeCreditLimitInStats && account.value.creditLimit > 0,
  );

  const displayBalance = computed(() =>
    hasCreditLimitAdjustment.value
      ? account.value.currentBalance - account.value.creditLimit
      : account.value.currentBalance,
  );

  const displayRefBalance = computed(() => {
    if (!hasCreditLimitAdjustment.value) return account.value.refCurrentBalance;
    // Derive proportionally from displayBalance to avoid exchange rate inconsistencies
    // between refCurrentBalance and refCreditLimit
    if (account.value.currentBalance === 0) return 0;
    const rate = account.value.refCurrentBalance / account.value.currentBalance;
    return displayBalance.value * rate;
  });

  return { hasCreditLimitAdjustment, displayBalance, displayRefBalance };
};
