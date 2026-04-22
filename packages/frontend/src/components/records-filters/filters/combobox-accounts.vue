<template>
  <Combobox.Combobox
    :model-value="undefined"
    v-model:open="isOpen"
    :multiple="true"
    :ignore-filter="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <Combobox.ComboboxTrigger
        class="border-input bg-input-background ring-offset-background focus-visible:ring-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium"
          >
            {{ isAllSelected ? storeAccounts!.length : selectedAccountIds.length }}
          </span>
          <span class="font-medium">
            {{
              isAllSelected
                ? $t('fields.comboboxAccounts.allAccounts')
                : `${selectedAccountIds.length === 1 ? $t('fields.comboboxAccounts.account') : $t('fields.comboboxAccounts.accountsSelected')}`
            }}</span
          >
        </div>

        <template v-if="!isAllSelected && selectedAccountIds.length > 0">
          <Button variant="ghost" size="icon" class="size-6" @click.stop="clearSelection">
            <XIcon class="text-muted-foreground size-4" />
          </Button>
        </template>
        <template v-else>
          <div class="size-6 p-1">
            <ChevronDown class="text-muted-foreground size-4" />
          </div>
        </template>
      </Combobox.ComboboxTrigger>
    </Combobox.ComboboxAnchor>

    <Combobox.ComboboxList
      class="max-h-120 w-(--reka-combobox-trigger-width) lg:max-h-100"
      :side="dropdownSide"
      :avoid-collisions="false"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <Combobox.ComboboxInput
          v-model="searchTerm"
          class="h-9 w-full rounded-md border pl-9 focus-visible:ring-0"
          :placeholder="$t('fields.comboboxAccounts.searchPlaceholder')"
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>
      <div class="max-h-105 overflow-y-auto p-1.25 lg:max-h-85">
        <p v-if="!hasAnyResults" class="text-muted-foreground py-2 text-center text-xs font-medium">
          {{ $t('fields.comboboxAccounts.noResults') }}
        </p>

        <!-- Grouped accounts -->
        <template v-for="group in filteredGroups" :key="group.id">
          <Collapsible :open="isGroupExpanded(group.id)">
            <Combobox.ComboboxGroup>
              <!-- Group header: checkbox zone (select) | name zone (collapse) -->
              <div class="hover:bg-accent flex items-center rounded-md">
                <div
                  class="flex shrink-0 cursor-pointer items-center justify-center py-1.5 pr-1 pl-2"
                  @click="toggleGroup(group.id)"
                >
                  <Checkbox
                    :model-value="groupCheckStates.get(group.id)"
                    class="size-3.5"
                    @click.stop
                    @update:model-value="toggleGroup(group.id)"
                  >
                    <MinusIcon v-if="groupCheckStates.get(group.id) === 'indeterminate'" class="size-3" />
                    <CheckIcon v-else class="size-3" />
                  </Checkbox>
                </div>
                <div
                  class="flex flex-1 cursor-pointer items-center gap-2 py-1.5 pr-2 pl-1.5"
                  @click="toggleCollapse(group.id)"
                >
                  <span class="flex-1 text-sm font-semibold">{{ group.name }}</span>
                  <span
                    class="text-primary bg-primary/10 min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-medium"
                  >
                    {{ group.accounts.length }}
                  </span>
                  <ChevronDown
                    class="text-muted-foreground size-4 shrink-0 transition-transform duration-200"
                    :class="{ 'rotate-180': isGroupExpanded(group.id) }"
                  />
                </div>
              </div>

              <CollapsibleContent>
                <ComboboxAccountItem
                  v-for="account in group.accounts"
                  :key="account.id"
                  :account="account"
                  :is-selected="isAccountSelected(account)"
                  indented
                  @pick="pickAccount(account)"
                />
              </CollapsibleContent>
            </Combobox.ComboboxGroup>
          </Collapsible>
        </template>

        <Combobox.ComboboxSeparator v-if="filteredGroups.length > 0 && filteredUngroupedAccounts.length > 0" />

        <!-- Ungrouped accounts -->
        <Combobox.ComboboxGroup v-if="filteredUngroupedAccounts.length > 0">
          <ComboboxAccountItem
            v-for="account in filteredUngroupedAccounts"
            :key="account.id"
            :account="account"
            :is-selected="isAccountSelected(account)"
            @pick="pickAccount(account)"
          />
        </Combobox.ComboboxGroup>
      </div>
    </Combobox.ComboboxList>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import Button from '@/components/lib/ui/button/Button.vue';
import { Checkbox, type CheckedState } from '@/components/lib/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@/components/lib/ui/collapsible';
import * as Combobox from '@/components/lib/ui/combobox';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { isEqual } from 'lodash-es';
import { CheckIcon, ChevronDown, MinusIcon, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import ComboboxAccountItem from './combobox-account-item.vue';

interface FlatGroup {
  id: number;
  name: string;
  accounts: AccountModel[];
}

const props = defineProps<{
  accounts: AccountModel[];
}>();

const emit = defineEmits(['update:accounts']);

// --- Helpers ---

function applySessionOrder<T extends { id: number }>({ items, order }: { items: T[]; order: number[] }): T[] {
  if (!order.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

function partitionSelectedFirst<T extends { id: number }>({
  items,
  selectedIds,
}: {
  items: T[];
  selectedIds: Set<number>;
}): number[] {
  const selected = items.filter((item) => selectedIds.has(item.id));
  const others = items.filter((item) => !selectedIds.has(item.id));
  return [...selected, ...others].map((item) => item.id);
}

// --- State ---

const searchTerm = ref('');
const isOpen = ref(false);

const { accounts: storeAccounts } = storeToRefs(useAccountsStore());

const isMobile = useWindowBreakpoints(1024);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

// --- Account groups data ---

const { data: accountGroups } = useQuery({
  queryFn: () => loadAccountGroups(),
  queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
  staleTime: Infinity,
  placeholderData: [],
});

// --- Flatten groups ---

const flattenGroup = ({ group }: { group: AccountGroups }): AccountModel[] => {
  const accounts = [...group.accounts];
  for (const child of group.childGroups ?? []) {
    accounts.push(...flattenGroup({ group: child }));
  }
  return accounts;
};

const flattenedGroups = computed<FlatGroup[]>(() => {
  const groups = accountGroups.value ?? [];
  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      accounts: flattenGroup({ group: g }),
    }))
    .filter((g) => g.accounts.length > 0);
});

const groupedAccountIds = computed(() => {
  const ids = new Set<number>();
  for (const group of flattenedGroups.value) {
    for (const account of group.accounts) {
      ids.add(account.id);
    }
  }
  return ids;
});

const sortAccounts = ({ accounts }: { accounts: AccountModel[] }) => {
  return [...accounts].sort((a, b) => {
    const aHasBalance = a.currentBalance !== 0;
    const bHasBalance = b.currentBalance !== 0;
    if (aHasBalance !== bHasBalance) return aHasBalance ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

const ungroupedAccounts = computed(() => {
  return sortAccounts({
    accounts: (storeAccounts.value ?? []).filter((a) => !groupedAccountIds.value.has(a.id)),
  });
});

// --- Selection state ---

const selectedAccountIds = ref<number[]>([]);

const selectedAccounts = computed(() =>
  (storeAccounts.value ?? []).filter((a) => selectedAccountIds.value.includes(a.id)),
);

watch(
  () => props.accounts,
  (newAccounts) => {
    const newIds = newAccounts.map((a) => a.id).sort();
    if (isEqual(newIds, [...selectedAccountIds.value].sort())) return;
    selectedAccountIds.value = newAccounts.map((a) => a.id);
  },
  { immediate: true },
);

const isAllSelected = computed(() => selectedAccountIds.value.length === 0);

const isAccountSelected = (account: AccountModel) => selectedAccountIds.value.includes(account.id);

const pickAccount = (account: AccountModel) => {
  const isSelected = selectedAccountIds.value.includes(account.id);
  if (!isSelected) {
    selectedAccountIds.value = [...selectedAccountIds.value, account.id];
  } else {
    selectedAccountIds.value = selectedAccountIds.value.filter((id) => id !== account.id);
  }
  emit('update:accounts', selectedAccounts.value);
};

const clearSelection = () => {
  selectedAccountIds.value = [];
  emit('update:accounts', []);
};

// --- Collapse state ---

const collapsedGroups = ref(new Set<number>());

const isGroupExpanded = (groupId: number): boolean => {
  if (normalizedSearch.value) return true;
  return !collapsedGroups.value.has(groupId);
};

const toggleCollapse = (groupId: number) => {
  const next = new Set(collapsedGroups.value);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  collapsedGroups.value = next;
};

// --- Group checkbox logic ---

const groupCheckStates = computed(() => {
  const selectedSet = new Set(selectedAccountIds.value);
  const states = new Map<number, CheckedState>();
  for (const group of flattenedGroups.value) {
    const selectedCount = group.accounts.filter((a) => selectedSet.has(a.id)).length;
    if (selectedCount === 0) states.set(group.id, false);
    else if (selectedCount === group.accounts.length) states.set(group.id, true);
    else states.set(group.id, 'indeterminate');
  }
  return states;
});

const toggleGroup = (groupId: number) => {
  const group = flattenedGroups.value.find((g) => g.id === groupId);
  if (!group) return;

  const groupAccountIds = group.accounts.map((a) => a.id);
  const allSelected = groupCheckStates.value.get(groupId) === true;

  if (allSelected) {
    const groupIdSet = new Set(groupAccountIds);
    selectedAccountIds.value = selectedAccountIds.value.filter((id) => !groupIdSet.has(id));
  } else {
    const currentSet = new Set(selectedAccountIds.value);
    const toAdd = groupAccountIds.filter((id) => !currentSet.has(id));
    selectedAccountIds.value = [...selectedAccountIds.value, ...toAdd];
  }

  emit('update:accounts', selectedAccounts.value);
};

// --- Session ordering ---

const sessionOrder = ref({
  groups: [] as number[],
  ungrouped: [] as number[],
  groupAccounts: new Map<number, number[]>(),
});

function captureSessionOrder() {
  collapsedGroups.value = new Set(flattenedGroups.value.map((g) => g.id));
  const selectedIds = new Set(selectedAccountIds.value);

  sessionOrder.value.groups = partitionSelectedFirst({
    items: flattenedGroups.value,
    selectedIds,
  });

  const accountOrderMap = new Map<number, number[]>();
  for (const group of flattenedGroups.value) {
    accountOrderMap.set(group.id, partitionSelectedFirst({ items: group.accounts, selectedIds }));
  }
  sessionOrder.value.groupAccounts = accountOrderMap;

  sessionOrder.value.ungrouped = partitionSelectedFirst({
    items: ungroupedAccounts.value,
    selectedIds,
  });
}

watch(isOpen, (open) => {
  if (!open) {
    searchTerm.value = '';
    return;
  }
  captureSessionOrder();
});

// --- Filtering ---

const normalizedSearch = computed(() => searchTerm.value.trim().toLowerCase());

const filteredGroups = computed<FlatGroup[]>(() => {
  const term = normalizedSearch.value;

  const orderedGroups = applySessionOrder({
    items: flattenedGroups.value,
    order: sessionOrder.value.groups,
  });

  return orderedGroups
    .map((group) => {
      const orderedAccounts = applySessionOrder({
        items: group.accounts,
        order: sessionOrder.value.groupAccounts.get(group.id) ?? [],
      });

      if (!term) return { ...group, accounts: orderedAccounts };

      if (group.name.toLowerCase().includes(term)) {
        return { ...group, accounts: orderedAccounts };
      }

      const matchingAccounts = orderedAccounts.filter(
        (a) => a.name.toLowerCase().includes(term) || a.currencyCode.toLowerCase().includes(term),
      );

      if (matchingAccounts.length === 0) return null;
      return { ...group, accounts: matchingAccounts };
    })
    .filter((g): g is FlatGroup => g !== null);
});

const filteredUngroupedAccounts = computed(() => {
  const term = normalizedSearch.value;

  const ordered = applySessionOrder({
    items: ungroupedAccounts.value,
    order: sessionOrder.value.ungrouped,
  });

  if (!term) return ordered;
  return ordered.filter((a) => a.name.toLowerCase().includes(term) || a.currencyCode.toLowerCase().includes(term));
});

const hasAnyResults = computed(() => filteredGroups.value.length > 0 || filteredUngroupedAccounts.value.length > 0);
</script>
