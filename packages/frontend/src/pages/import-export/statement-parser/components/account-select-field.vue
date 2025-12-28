<script setup lang="ts">
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import type { AccountModel } from '@bt/shared/types';
import { InfoIcon, XIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: AccountModel | null;
  accounts: AccountModel[];
  detectedCurrency?: string | null;
  placeholder?: string;
  disabled?: boolean;
  isNewAccount?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AccountModel | null];
}>();

const searchQuery = ref('');
const isOpen = ref(false);

// Helper to check if account is linked to a bank
const isLinkedToBank = (account: AccountModel) => !!account.externalId;

const filteredAccounts = computed(() => {
  const query = searchQuery.value.toLowerCase();
  if (!query) return props.accounts;
  return props.accounts.filter(
    (account) => account.name.toLowerCase().includes(query) || account.currencyCode.toLowerCase().includes(query),
  );
});

// Selectable accounts: matching currency AND not linked to bank
const selectableAccounts = computed(() => {
  if (!props.detectedCurrency) {
    return filteredAccounts.value.filter((account) => !isLinkedToBank(account));
  }
  return filteredAccounts.value.filter(
    (account) => account.currencyCode === props.detectedCurrency && !isLinkedToBank(account),
  );
});

// Different currency accounts (disabled)
const differentCurrencyAccounts = computed(() => {
  if (!props.detectedCurrency) {
    return [];
  }
  return filteredAccounts.value.filter(
    (account) => account.currencyCode !== props.detectedCurrency && !isLinkedToBank(account),
  );
});

// Bank-linked accounts (disabled)
const linkedToBankAccounts = computed(() => {
  return filteredAccounts.value.filter((account) => isLinkedToBank(account));
});

const selectedKey = computed({
  get: () => (props.modelValue ? String(props.modelValue.id) : ''),
  set: (key: string) => {
    const newValue = props.accounts.find((account) => String(account.id) === key) ?? null;
    searchQuery.value = '';
    emit('update:modelValue', newValue);
  },
});

// Reset search when dropdown closes
watch(isOpen, (open) => {
  if (!open) {
    searchQuery.value = '';
  }
});
</script>

<template>
  <Select.Select v-model="selectedKey" :disabled="disabled" @update:open="isOpen = $event">
    <Select.SelectTrigger class="w-full">
      <Select.SelectValue :placeholder="placeholder ?? 'Select an account'">
        <template v-if="modelValue">
          <span>{{ modelValue.name }}</span>
          <span class="text-muted-foreground ml-1">({{ modelValue.currencyCode }})</span>
          <span v-if="isNewAccount" class="text-primary ml-1">(newly created)</span>
        </template>
        <template v-else>
          {{ placeholder ?? 'Select an account' }}
        </template>
      </Select.SelectValue>
    </Select.SelectTrigger>

    <Select.SelectContent class="max-h-80">
      <!-- Search input -->
      <div class="p-2">
        <InputField
          v-model="searchQuery"
          type="text"
          placeholder="Search accounts..."
          trailing-icon-css-class="px-0"
          @keydown.stop
        >
          <template #iconTrailing>
            <template v-if="searchQuery">
              <Button variant="ghost" size="icon" @click.stop="searchQuery = ''">
                <XIcon class="size-4" />
              </Button>
            </template>
          </template>
        </InputField>
      </div>

      <!-- Selectable accounts (matching currency, not linked to bank) -->
      <Select.SelectGroup v-if="selectableAccounts.length > 0">
        <Select.SelectLabel v-if="detectedCurrency" class="text-muted-foreground text-xs">
          {{ detectedCurrency }} Accounts
        </Select.SelectLabel>
        <Select.SelectItem
          v-for="account in selectableAccounts"
          :key="account.id"
          :value="String(account.id)"
          class="flex flex-col items-start"
        >
          <span>
            {{ account.name }}
            <span class="text-muted-foreground ml-1">{{ account.currencyCode }}</span>
            <span v-if="isNewAccount && modelValue?.id === account.id" class="text-primary ml-1">(newly created)</span>
          </span>
        </Select.SelectItem>
      </Select.SelectGroup>

      <!-- Different currency accounts (disabled) -->
      <template v-if="differentCurrencyAccounts.length > 0">
        <Select.SelectSeparator v-if="selectableAccounts.length > 0" />
        <Select.SelectGroup>
          <Select.SelectLabel class="text-muted-foreground text-xs"> Different Currency </Select.SelectLabel>
          <Select.SelectItem
            v-for="account in differentCurrencyAccounts"
            :key="account.id"
            :value="String(account.id)"
            disabled
            class="flex flex-col items-start"
          >
            <span>
              {{ account.name }}
              <span class="text-muted-foreground ml-1">{{ account.currencyCode }}</span>
            </span>
          </Select.SelectItem>
        </Select.SelectGroup>
      </template>

      <!-- Bank-linked accounts (disabled) -->
      <template v-if="linkedToBankAccounts.length > 0">
        <Select.SelectSeparator v-if="selectableAccounts.length > 0 || differentCurrencyAccounts.length > 0" />
        <Select.SelectGroup>
          <Select.SelectLabel class="text-muted-foreground flex items-center gap-1 text-xs">
            Linked to Banks
            <ResponsiveTooltip content="For now, statement import is limited to system accounts only.">
              <InfoIcon class="size-3 cursor-help" />
            </ResponsiveTooltip>
          </Select.SelectLabel>
          <Select.SelectItem
            v-for="account in linkedToBankAccounts"
            :key="account.id"
            :value="String(account.id)"
            disabled
            class="flex flex-col items-start"
          >
            <span>
              {{ account.name }}
              <span class="text-muted-foreground ml-1">{{ account.currencyCode }}</span>
            </span>
          </Select.SelectItem>
        </Select.SelectGroup>
      </template>

      <!-- No accounts found -->
      <div
        v-if="
          selectableAccounts.length === 0 && differentCurrencyAccounts.length === 0 && linkedToBankAccounts.length === 0
        "
        class="text-muted-foreground py-4 text-center text-sm"
      >
        No accounts found
      </div>
    </Select.SelectContent>
  </Select.Select>
</template>
