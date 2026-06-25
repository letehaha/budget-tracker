import type { SidebarSectionsConfig } from '@/api/user-settings';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { CarIcon, RocketIcon, TrendingUpIcon } from '@lucide/vue';
import { type Component, computed } from 'vue';

type SidebarSectionKey = keyof SidebarSectionsConfig;

interface ToggleableSidebarSection {
  key: SidebarSectionKey;
  labelKey: string;
  icon: Component;
}

/**
 * Optional sidebar sections the user can show or hide. Bank Accounts is always
 * visible, so it is intentionally absent here and rendered separately as a
 * disabled, always-on row by the consuming UIs.
 */
export const TOGGLEABLE_SIDEBAR_SECTIONS: ToggleableSidebarSection[] = [
  { key: 'portfolios', labelKey: 'sidebar.accountsView.portfolios', icon: TrendingUpIcon },
  { key: 'ventures', labelKey: 'sidebar.accountsView.ventures', icon: RocketIcon },
  { key: 'vehicles', labelKey: 'sidebar.accountsView.cars', icon: CarIcon },
];

/**
 * Shared read/write access to the sidebar-section visibility preferences. Used
 * by both the sidebar's quick-settings popover and the appearance settings
 * page so the two stay in sync. A toggle is written as a partial patch so it
 * never clobbers the other sections' values.
 */
export const useSidebarSections = () => {
  const { data: userSettings, patchAsync, isPatching } = useUserSettings();

  const sidebarSections = computed<SidebarSectionsConfig>(() => ({
    portfolios: userSettings.value?.sidebarSections?.portfolios ?? true,
    ventures: userSettings.value?.sidebarSections?.ventures ?? true,
    vehicles: userSettings.value?.sidebarSections?.vehicles ?? true,
  }));

  const toggleSection = (key: SidebarSectionKey, value: boolean) => {
    const patch: Partial<SidebarSectionsConfig> = { [key]: value };
    return patchAsync({ sidebarSections: patch });
  };

  return { sidebarSections, toggleSection, isUpdating: isPatching };
};
