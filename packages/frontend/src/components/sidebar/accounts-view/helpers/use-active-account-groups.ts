import type { AccountGroups } from '@/common/types/models';
import { ROUTES_NAMES } from '@/routes';
import { useLocalStorage } from '@vueuse/core';
import { Ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';

const persistedOpenGroupIds = useLocalStorage<string[]>('sidebar:accounts-open-group-ids', []);

export function useActiveAccountGroups(groups: Ref<AccountGroups[]>) {
  const route = useRoute();
  const activeAccountId = computed(() => (route.name === ROUTES_NAMES.account ? String(route.params.id) : null));

  const flatGroups = computed(() => {
    const flat: Record<string, AccountGroups> = {};
    const flatten = (group: AccountGroups) => {
      flat[group.id] = group;
      group.childGroups.forEach(flatten);
    };
    groups.value.forEach(flatten);
    return flat;
  });

  const routeDrivenOpenGroupIds = computed(() => {
    if (!activeAccountId.value) return new Set<string>();

    const openIds = new Set<string>();
    const walkUp = (groupId: string | null) => {
      if (groupId === null) return;
      const group = flatGroups.value[groupId];
      if (group) {
        openIds.add(group.id);
        walkUp(group.parentGroupId ?? null);
      }
    };

    for (const group of Object.values(flatGroups.value)) {
      if (group.accounts.some((account) => account.id === activeAccountId.value)) {
        walkUp(group.id);
        break;
      }
    }
    return openIds;
  });

  watch(
    routeDrivenOpenGroupIds,
    (ids) => {
      if (!ids.size) return;
      const next = new Set(persistedOpenGroupIds.value);
      let changed = false;
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (changed) persistedOpenGroupIds.value = Array.from(next);
    },
    { immediate: true },
  );

  const openGroupIdsSet = computed(() => new Set(persistedOpenGroupIds.value));

  const isGroupOpen = (id: string) => openGroupIdsSet.value.has(id);

  const setGroupOpen = (id: string, open: boolean) => {
    const next = new Set(persistedOpenGroupIds.value);
    if (open) next.add(id);
    else next.delete(id);
    persistedOpenGroupIds.value = Array.from(next);
  };

  return {
    activeAccountId,
    openGroupIdsSet,
    isGroupOpen,
    setGroupOpen,
  };
}
