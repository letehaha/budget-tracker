<template>
  <div class="grid gap-4">
    <DateRangeFilter
      :start="filters.start"
      :end="filters.end"
      @update:start="$emit('update:filters', { ...filters, start: $event })"
      @update:end="$emit('update:filters', { ...filters, end: $event })"
    />

    <TransactionTypeFilter
      :value="filters.transactionType"
      @update:value="$emit('update:filters', { ...filters, transactionType: $event })"
    />

    <AmountRangeFilter
      :amount-gte="filters.amountGte"
      :amount-lte="filters.amountLte"
      @update:amount-gte="$emit('update:filters', { ...filters, amountGte: $event })"
      @update:amount-lte="$emit('update:filters', { ...filters, amountLte: $event })"
    />

    <ExclusionsFilter
      :exclude-refunds="filters.excludeRefunds"
      :exclude-transfer="filters.excludeTransfer"
      @update:exclude-refunds="$emit('update:filters', { ...filters, excludeRefunds: $event })"
      @update:exclude-transfer="$emit('update:filters', { ...filters, excludeTransfer: $event })"
    />

    <NoteIncludesFilter
      :note-includes="filters.noteIncludes"
      @update:note-includes="$emit('update:filters', { ...filters, noteIncludes: $event })"
    />

    <AccountsFilter
      :accounts="filters.accounts"
      @update:accounts="$emit('update:filters', { ...filters, accounts: $event })"
    />
  </div>

  <div class="lg:bg-card max-lg:bg-background sticky -bottom-px mt-4 flex gap-2">
    <UiButton
      variant="secondary"
      :disabled="isResetButtonDisabled"
      class="w-full shrink"
      @click="$emit('reset-filters')"
    >
      Reset
    </UiButton>

    <template v-if="isFiltersOutOfSync">
      <UiButton variant="default" class="w-full shrink" @click="$emit('apply-filters')"> Apply </UiButton>
    </template>
  </div>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';

import { FiltersStruct } from './const';
import AccountsFilter from './filters/combobox-accounts.vue';
import AmountRangeFilter from './filters/amount-range-filter.vue';
import DateRangeFilter from './filters/date-range-filter.vue';
import ExclusionsFilter from './filters/exclusions.vue';
import NoteIncludesFilter from './filters/note-includes.vue';
import TransactionTypeFilter from './filters/transaction-type-filter.vue';

defineProps<{
  filters: FiltersStruct;
  isResetButtonDisabled: boolean;
  isFiltersOutOfSync: boolean;
}>();

defineEmits(['update:filters', 'reset-filters', 'apply-filters']);
</script>
