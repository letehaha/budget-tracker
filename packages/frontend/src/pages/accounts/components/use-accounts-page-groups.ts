import { useLocalStorage } from '@vueuse/core';

// Module-scoped so every AccountGroupRow instance on the Accounts page shares one
// open/closed set, persisted across reloads. Kept separate from the sidebar's own
// open-state key so expanding a group on the page doesn't move it in the sidebar.
// Default = every group closed.
const openGroupIds = useLocalStorage<string[]>('accounts-page:open-group-ids', []);

export function useAccountsPageGroups() {
  const isGroupOpen = (id: string): boolean => openGroupIds.value.includes(id);

  const setGroupOpen = (id: string, open: boolean): void => {
    const next = new Set(openGroupIds.value);
    if (open) next.add(id);
    else next.delete(id);
    openGroupIds.value = Array.from(next);
  };

  return { isGroupOpen, setGroupOpen };
}
