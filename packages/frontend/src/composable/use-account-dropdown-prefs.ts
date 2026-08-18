import { useUserSettings } from '@/composable/data-queries/user-settings';
import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { computed } from 'vue';

type DropdownAccount = { id: string; status?: ACCOUNT_STATUSES };

export const resolveDefaultAccount = <T extends DropdownAccount>({
  accounts,
  defaultAccountId,
  fallbackToFirst = true,
}: {
  accounts: T[];
  defaultAccountId: string | null;
  fallbackToFirst?: boolean;
}): T | null =>
  accounts.find((account) => account.id === defaultAccountId) ?? (fallbackToFirst ? (accounts[0] ?? null) : null);

/** Options without a `status` (the out-of-wallet mock) are never archivable, so they always stay visible. */
export const filterDropdownAccounts = <T extends DropdownAccount>({
  accounts,
  showArchived,
  selectedId,
}: {
  accounts: T[];
  showArchived: boolean;
  selectedId?: string | null;
}): T[] =>
  showArchived
    ? accounts
    : accounts.filter(
        (account) =>
          account.status === undefined || account.status === ACCOUNT_STATUSES.active || account.id === selectedId,
      );

/**
 * Shared read/write access to the account-dropdown preferences: which account seeds a fresh
 * picker, and whether archived accounts are offered as options.
 */
export const useAccountDropdownPrefs = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const defaultAccountId = computed(() => userSettings.value?.accounts?.defaultAccountId ?? null);
  const showArchivedInDropdowns = computed(() => !!userSettings.value?.accounts?.showArchivedInDropdowns);

  return {
    defaultAccountId,
    showArchivedInDropdowns,
    // Archived accounts hidden by the preference are excluded from resolution too,
    // so a fresh picker never preselects an account its dropdown would hide.
    resolveDefaultAccount: <T extends DropdownAccount>({
      accounts,
      fallbackToFirst,
    }: {
      accounts: T[];
      fallbackToFirst?: boolean;
    }): T | null =>
      resolveDefaultAccount({
        accounts: filterDropdownAccounts({ accounts, showArchived: showArchivedInDropdowns.value }),
        defaultAccountId: defaultAccountId.value,
        fallbackToFirst,
      }),
    setDefaultAccountId: ({ id }: { id: string | null }) => patchAsync({ accounts: { defaultAccountId: id } }),
    setShowArchivedInDropdowns: ({ value }: { value: boolean }) =>
      patchAsync({ accounts: { showArchivedInDropdowns: value } }),
    isUpdating: isPatching,
  };
};
