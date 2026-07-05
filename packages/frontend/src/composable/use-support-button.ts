import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed } from 'vue';

/**
 * Shared read/write access to the header "Support" (donation) button visibility.
 * Used by both the header (to render the button) and the appearance settings
 * page (to toggle it) so the two stay in sync. Defaults to visible when the user
 * has no stored preference.
 */
export const useSupportButton = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const isSupportButtonVisible = computed(() => userSettings.value?.showSupportButton ?? true);

  const setSupportButtonVisible = (value: boolean) => patchAsync({ showSupportButton: value });

  return { isSupportButtonVisible, setSupportButtonVisible, isUpdating: isPatching };
};
