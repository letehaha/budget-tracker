<template>
  <Combobox.Combobox
    v-model="selectedAccounts"
    v-model:searchTerm="searchTerm"
    v-model:open="isOpen"
    :multiple="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <div class="flex justify-between w-full rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div class="flex items-center gap-2">
          <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium">
            {{ isAllSelected ? storeAccounts.length : selectedAccounts.length }}
          </span>
          <span class="font-medium"> {{ isAllSelected ? 'All accounts' : (selectedAccounts.length === 0 ? 'No accounts selected' : (selectedAccounts.length === 1 ? 'account' : 'accounts') + ' selected') }}</span>
        </div>
        <Combobox.ComboboxTrigger>
          <ChevronDown class="h-4 w-4 text-muted-foreground"/>
        </Combobox.ComboboxTrigger>
      </div>
    </Combobox.ComboboxAnchor>

    <Combobox.ComboboxContent>
      <div class="relative w-full max-w-sm items-center p-2 pb-0">
        <Combobox.ComboboxInput class="pl-9 focus-visible:ring-0 border rounded-md h-9 w-full" placeholder="Search accounts..." />
        <SearchIcon class="absolute w-5 h-5 left-4 top-[60%] -translate-y-1/2 text-muted-foreground" />
      </div>
      <Combobox.ComboboxViewport class="p-[5px]">
        <Combobox.ComboboxEmpty class="text-mauve8 text-xs font-medium text-center py-2" />

        <Combobox.ComboboxGroup>

          <Combobox.ComboboxItem
            v-if="displayedAccounts.length"
            :value="!isAllSelected"
            class="px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer flex items-center"
            @click="selectAllAccounts"
            @select.prevent
          >
            <Checkbox :checked="isAllSelected" @update:checked="selectAllAccounts($event)" />
            <span>All Accounts</span>
          </Combobox.ComboboxItem>

          <Combobox.ComboboxItem
            v-for="account in displayedAccounts"
            :key="account.id"
            :value="account.name"
            class="justify-between px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded-md cursor-pointer flex flex-start items-center"
            @click="pickAccount(account)"
            @select.prevent
          >
            <span>{{ account.name }}</span>
            <CheckIcon v-if="isAccountSelected(account)" />
          </Combobox.ComboboxItem>

        </Combobox.ComboboxGroup>
      </Combobox.ComboboxViewport>
    </Combobox.ComboboxContent>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { useAccountsStore } from '@/stores';
import { ChevronDown, SearchIcon, CheckIcon } from 'lucide-vue-next';
import { AccountModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  accounts: AccountModel[];
}>();

const emit = defineEmits(['update:accounts']);

const searchTerm = ref('');
const isOpen = ref(false);

const { accounts: storeAccounts } = storeToRefs(useAccountsStore());

const pickAccount = (account: AccountModel) => {
  userTouchedSelection.value = true
  const isSelected = isAccountSelected(account);
  toggleAccount(account, !isSelected);
};

const baseSortedAccounts = computed(() => {
  return [...storeAccounts.value].sort((a, b) => a.name.localeCompare(b.name));
});

const sessionOrder = ref<number[]>([]);

watch(isOpen, (open) => {
  if (open) {
    const selectedIds = new Set(selectedAccounts.value.map(a => a.id));
    const selectedFirst = baseSortedAccounts.value.filter(a => selectedIds.has(a.id));
    const others = baseSortedAccounts.value.filter(a => !selectedIds.has(a.id));
    sessionOrder.value = [...selectedFirst, ...others].map(a => a.id);
  }
});

const orderedAccounts = computed(() => {
  if (isOpen.value && sessionOrder.value.length) {
    const byId = new Map(baseSortedAccounts.value.map(a => [a.id, a] as const));
    return sessionOrder.value.map(id => byId.get(id)!).filter(Boolean);
  }
  return baseSortedAccounts.value;
});

const displayedAccounts = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return orderedAccounts.value;
  return orderedAccounts.value.filter(a => a.name.toLowerCase().includes(term));
});

const selectedAccounts = ref<AccountModel[]>([]);
const userTouchedSelection = ref(false)
const initialized = ref(false)

watch(
  [storeAccounts, () => props.accounts],
  ([storeAccs, inputAccs]) => {
    if (initialized.value) return
    if (inputAccs && inputAccs.length) {
      selectedAccounts.value = [...inputAccs];
      initialized.value = true
      emit('update:accounts', selectedAccounts.value)
      return
    }
    if (storeAccs && storeAccs.length) {
      selectedAccounts.value = [...storeAccs];
      initialized.value = true
      emit('update:accounts', selectedAccounts.value)
    }
  },
  { immediate: true },
);

const isAllSelected = computed(
  () => selectedAccounts.value.length === storeAccounts.value.length && storeAccounts.value.length > 0,
)

const isAccountSelected = (account: AccountModel) => selectedAccounts.value.some((a) => a.id === account.id);

const toggleAccount = (account: AccountModel, checked: boolean) => {
  userTouchedSelection.value = true
  if (checked) {
    if (!isAccountSelected(account)) selectedAccounts.value = [...selectedAccounts.value, account];
  } else {
    selectedAccounts.value = selectedAccounts.value.filter((a) => a.id !== account.id);
  }
  emit('update:accounts', selectedAccounts.value);
};

const selectAllAccounts = (payload?: boolean | Event) => {
  userTouchedSelection.value = true
  const isBoolean = typeof payload === 'boolean'
  const shouldSelect = isBoolean ? payload : !isAllSelected.value
  selectedAccounts.value = shouldSelect ? [...storeAccounts.value] : []
  emit('update:accounts', selectedAccounts.value)
}
</script>
