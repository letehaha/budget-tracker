<template>
  <Combobox.Combobox
    :model-value="undefined"
    v-model:searchTerm="searchTerm"
    v-model:open="isOpen"
    :multiple="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <Combobox.ComboboxTrigger
        class="ring-offset-background focus-visible:ring-ring flex w-full justify-between rounded-md text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium"
          >
            {{ isAllSelected ? storeAccounts.length : selectedAccounts.length }}
          </span>
          <span class="font-medium">
            {{
              isAllSelected
                ? $t('fields.comboboxAccounts.allAccounts')
                : `${selectedAccounts.length === 1 ? $t('fields.comboboxAccounts.account') : $t('fields.comboboxAccounts.accountsSelected')}`
            }}</span
          >
        </div>

        <template v-if="!isAllSelected && selectedAccounts.length > 0">
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
      class="max-h-[400px] w-[var(--reka-combobox-trigger-width)] lg:max-h-[300px]"
      :side="dropdownSide"
      :avoid-collisions="false"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <Combobox.ComboboxInput
          class="h-9 w-full rounded-md border pl-9 focus-visible:ring-0"
          :placeholder="$t('fields.comboboxAccounts.searchPlaceholder')"
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>
      <div class="max-h-[340px] overflow-y-auto p-[5px] lg:max-h-[240px]">
        <Combobox.ComboboxEmpty class="text-mauve8 py-2 text-center text-xs font-medium" />

        <Combobox.ComboboxGroup>
          <Combobox.ComboboxItem
            v-for="account in displayedAccounts"
            :key="account.id"
            :value="account"
            class="hover:bg-accent hover:text-accent-foreground flex-start flex cursor-pointer items-center justify-between rounded-md px-2 py-1"
            @select.prevent="pickAccount(account)"
          >
            <span>{{ account.name }}</span>
            <CheckIcon v-if="isAccountSelected(account)" />
          </Combobox.ComboboxItem>
        </Combobox.ComboboxGroup>
      </div>
    </Combobox.ComboboxList>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import Button from '@/components/lib/ui/button/Button.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { isEqual } from 'lodash-es';
import { CheckIcon, ChevronDown, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  accounts: AccountModel[];
}>();

const emit = defineEmits(['update:accounts']);

const searchTerm = ref('');
const isOpen = ref(false);

const { accounts: storeAccounts } = storeToRefs(useAccountsStore());

const isMobile = useWindowBreakpoints(1024);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

const pickAccount = (account: AccountModel) => {
  const isSelected = isAccountSelected(account);
  toggleAccount(account, !isSelected);
};

const baseSortedAccounts = computed(() => {
  return [...storeAccounts.value].sort((a, b) => {
    // Prioritize accounts with non-zero balance
    const aHasBalance = a.currentBalance !== 0;
    const bHasBalance = b.currentBalance !== 0;

    if (aHasBalance !== bHasBalance) {
      return aHasBalance ? -1 : 1; // Accounts with balance come first
    }

    // Within same balance status, sort alphabetically by name
    return a.name.localeCompare(b.name);
  });
});

const sessionOrder = ref<number[]>([]);

watch(isOpen, (open) => {
  if (open) {
    const selectedIds = new Set(selectedAccountIds.value);
    const selectedFirst = baseSortedAccounts.value.filter((a) => selectedIds.has(a.id));
    const others = baseSortedAccounts.value.filter((a) => !selectedIds.has(a.id));
    sessionOrder.value = [...selectedFirst, ...others].map((a) => a.id);
  }
});

const orderedAccounts = computed(() => {
  if (isOpen.value && sessionOrder.value.length) {
    const byId = new Map(baseSortedAccounts.value.map((a) => [a.id, a] as const));
    return sessionOrder.value.map((id) => byId.get(id)!).filter(Boolean);
  }
  return baseSortedAccounts.value;
});

const displayedAccounts = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return orderedAccounts.value;
  return orderedAccounts.value.filter((a) => a.name.toLowerCase().includes(term));
});

const selectedAccountIds = ref<number[]>([]);

// Derive selectedAccounts from IDs - no need to maintain separately
const selectedAccounts = computed(() => storeAccounts.value.filter((a) => selectedAccountIds.value.includes(a.id)));

// Sync internal state when props change (and differ from current state)
watch(
  () => props.accounts,
  (newAccounts) => {
    const newIds = newAccounts.map((a) => a.id).sort();
    // Only sync if values actually differ (prevents loops)
    if (isEqual(newIds, [...selectedAccountIds.value].sort())) return;

    selectedAccountIds.value = newAccounts.map((a) => a.id);
  },
  { immediate: true },
);

const isAllSelected = computed(() => selectedAccountIds.value.length === 0);

const isAccountSelected = (account: AccountModel) => selectedAccountIds.value.includes(account.id);

const toggleAccount = (account: AccountModel, checked: boolean) => {
  if (checked) {
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
</script>
