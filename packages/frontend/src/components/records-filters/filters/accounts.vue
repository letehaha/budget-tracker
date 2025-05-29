<template>
  <Collapsible.Collapsible v-model:open="isOpen">
    <Collapsible.CollapsibleTrigger class="w-full">
      <div class="flex items-center gap-2">
        <template v-if="isOpen">
          <ChevronUpIcon />
        </template>
        <template v-else>
          <ChevronDownIcon />
        </template>

        <span> Accounts: </span>
      </div>
    </Collapsible.CollapsibleTrigger>

    <Collapsible.CollapsibleContent>
      <div class="grid pl-4">
        <label class="flex cursor-pointer items-center gap-2 py-1">
          <Checkbox :checked="isAllSelected" @update:checked="selectAll($event)" />
          All accounts
        </label>

        <template v-for="account in sortedAccounts" :key="account.id">
          <label class="flex cursor-pointer items-center gap-2 overflow-hidden text-ellipsis py-1">
            <Checkbox :checked="isAccountSelected(account)" @update:checked="toggleAccount(account, $event)" />

            <span class="text-ellipsis">
              {{ account.name }}
            </span>
          </label>
        </template>
      </div>
    </Collapsible.CollapsibleContent>
  </Collapsible.Collapsible>
</template>

<script setup lang="ts">
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import * as Collapsible from '@/components/lib/ui/collapsible';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel } from '@bt/shared/types';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

// Order in what accounts should be displayed. For more convenience
const categoryOrder = [
  ACCOUNT_CATEGORIES.creditCard,
  ACCOUNT_CATEGORIES.general,
  ACCOUNT_CATEGORIES.cash,
  ACCOUNT_CATEGORIES.investment,
  ACCOUNT_CATEGORIES.crypto,
  ACCOUNT_CATEGORIES.saving,
  // others will follow
];

const props = defineProps<{
  accounts: AccountModel[];
}>();

const emit = defineEmits(['update:accounts']);

const { accounts: storeAccounts } = storeToRefs(useAccountsStore());

const sortedAccounts = computed(() => {
  return [...storeAccounts.value].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.accountCategory);
    const bIndex = categoryOrder.indexOf(b.accountCategory);

    const aRank = aIndex === -1 ? categoryOrder.length : aIndex;
    const bRank = bIndex === -1 ? categoryOrder.length : bIndex;

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.name.localeCompare(b.name);
  });
});

const isOpen = ref(false);
const selectedAccounts = ref<AccountModel[]>([...props.accounts]);

watch(
  () => props.accounts,
  (newAccounts) => {
    selectedAccounts.value = [...newAccounts];
  },
  { immediate: true },
);

const isAllSelected = computed(
  () => selectedAccounts.value.length === storeAccounts.value.length || selectedAccounts.value.length === 0,
);

const isAccountSelected = (account: AccountModel) => selectedAccounts.value.some((a) => a.id === account.id);

const selectAll = (checked: boolean) => {
  selectedAccounts.value = checked ? [] : [...storeAccounts.value];
  emit('update:accounts', selectedAccounts.value);
};

const toggleAccount = (account: AccountModel, checked: boolean) => {
  if (checked) {
    selectedAccounts.value = [...selectedAccounts.value, account];
  } else {
    selectedAccounts.value = selectedAccounts.value.filter((a) => a.id !== account.id);
  }
  emit('update:accounts', selectedAccounts.value);
};
</script>
