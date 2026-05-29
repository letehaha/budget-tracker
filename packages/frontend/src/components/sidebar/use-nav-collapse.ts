import { computed, ref } from 'vue';

const isAccountsOpen = ref(false);
const isTransactionsOpen = ref(false);
const isPlannedOpen = ref(false);

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
