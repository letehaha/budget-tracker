import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed } from 'vue';

/**
 * Read/write access to the per-user "map picker" preference. Off by default, because it gates
 * loading map tiles and address search from OpenStreetMap.
 */
export const useMapPickerSetting = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const enabled = computed(() => userSettings.value?.ui?.transactionForm?.mapPicker ?? false);

  const setEnabled = ({ value }: { value: boolean }) => patchAsync({ ui: { transactionForm: { mapPicker: value } } });

  return { enabled, setEnabled, isUpdating: isPatching };
};
