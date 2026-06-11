import type { TransactionsMobileView } from '@/api/user-settings';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed, ref } from 'vue';

const DEFAULT_MOBILE_VIEW: TransactionsMobileView = 'list';

/**
 * Preferred transactions view on narrow screens (compact list vs full table),
 * persisted in UserSettings under `ui.transactionsTable.mobileView`. A local
 * override shadows the stored value so toggling feels instant while the
 * settings mutation is in flight.
 */
export function useMobileView() {
  const { data: userSettings, patch: patchSettings } = useUserSettings();

  const localView = ref<TransactionsMobileView | null>(null);

  const mobileView = computed<TransactionsMobileView>(
    () => localView.value ?? userSettings.value?.ui?.transactionsTable?.mobileView ?? DEFAULT_MOBILE_VIEW,
  );

  const setMobileView = (view: TransactionsMobileView) => {
    localView.value = view;
    patchSettings({ ui: { transactionsTable: { mobileView: view } } });
  };

  return { mobileView, setMobileView };
}
