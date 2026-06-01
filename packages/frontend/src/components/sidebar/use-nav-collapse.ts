import { useLocalStorage } from '@vueuse/core';
import { computed } from 'vue';

const isAccountsOpen = useLocalStorage('sidebar:nav-accounts-open', false);
const isTransactionsOpen = useLocalStorage('sidebar:nav-transactions-open', false);
const isPlannedOpen = useLocalStorage('sidebar:nav-planned-open', false);

export function useSidebarNavCollapse() {
  const hasAnyOpen = computed(() => isAccountsOpen.value || isTransactionsOpen.value || isPlannedOpen.value);

  const collapseAll = () => {
    isAccountsOpen.value = false;
    isTransactionsOpen.value = false;
    isPlannedOpen.value = false;
  };

  return {
    isAccountsOpen,
    isTransactionsOpen,
    isPlannedOpen,
    hasAnyOpen,
    collapseAll,
  };
}
