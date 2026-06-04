import { createSharedComposable, useLocalStorage } from '@vueuse/core';
import { computed } from 'vue';

type NavSection = 'accounts' | 'transactions' | 'planned';

export const useSidebarNavCollapse = createSharedComposable(() => {
  const openSection = useLocalStorage<NavSection | null>('sidebar:nav-open-section', null);

  const sectionOpen = (section: NavSection) =>
    computed<boolean>({
      get: () => openSection.value === section,
      set: (val) => {
        if (val) {
          openSection.value = section;
        } else if (openSection.value === section) {
          openSection.value = null;
        }
      },
    });

  return {
    isAccountsOpen: sectionOpen('accounts'),
    isTransactionsOpen: sectionOpen('transactions'),
    isPlannedOpen: sectionOpen('planned'),
    hasAnyOpen: computed(() => openSection.value !== null),
    collapseAll: () => {
      openSection.value = null;
    },
  };
});
