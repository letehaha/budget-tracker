import type { AccountGroups } from '@/common/types/models';
import { ROUTES_NAMES } from '@/routes';
import { Ref, computed } from 'vue';
import { useRoute } from 'vue-router';

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

  const openGroupIds = computed(() => {
    if (!activeAccountId.value) return new Set<string>();

    const openIds = new Set<string>();
    const checkGroup = (groupId: string | null) => {
      if (groupId === null) return;
      const group = flatGroups.value[groupId];
      if (group) {
        openIds.add(group.id);
        checkGroup(group.parentGroupId ?? null);
      }
    };

    for (const group of Object.values(flatGroups.value)) {
      if (group.accounts.some((account) => account.id === activeAccountId.value)) {
        checkGroup(group.id);
        break;
      }
    }

    return openIds;
  });

  return {
    openGroupIds,
    activeAccountId,
  };
}
