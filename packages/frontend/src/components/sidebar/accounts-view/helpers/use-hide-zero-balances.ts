import type { AccountGroups } from '@/common/types/models';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { AccountModel } from '@bt/shared/types';
import { computed } from 'vue';

import { groupHasVisibleAccount, isZeroBalanceAccount } from './zero-balance';

/**
 * Shared read/write access to the "hide zero balances" sidebar preference. The list components
 * use it to drop zero-balance rows and emptied groups; the settings popover uses `setHideZeroBalances`
 * to flip it. Credit-limit adjustment is threaded from `includeCreditLimitInStats` so the zero
 * check lines up with the balances actually rendered on the rows.
 */
export const useHideZeroBalances = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const hideZeroBalances = computed(() => !!userSettings.value?.hideZeroBalances);
  const includeCreditLimit = computed(() => !!userSettings.value?.includeCreditLimitInStats);

  const filterAccounts = (accounts: AccountModel[]): AccountModel[] =>
    hideZeroBalances.value
      ? accounts.filter((account) => !isZeroBalanceAccount({ account, includeCreditLimit: includeCreditLimit.value }))
      : accounts;

  const isGroupVisible = (group: AccountGroups): boolean =>
    !hideZeroBalances.value || groupHasVisibleAccount({ group, includeCreditLimit: includeCreditLimit.value });

  const setHideZeroBalances = (value: boolean) => patchAsync({ hideZeroBalances: value });

  return { hideZeroBalances, filterAccounts, isGroupVisible, setHideZeroBalances, isUpdating: isPatching };
};
