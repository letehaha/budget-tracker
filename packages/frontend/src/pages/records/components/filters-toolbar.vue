<template>
  <div class="@container/tx-filters p-3">
    <!-- Float-based flow instead of flexbox: only line boxes (inline-level filter
         wrappers) can flow around a float, which keeps the actions pinned to the
         top-right corner while filters wrap onto following lines and reclaim the
         full container width below the actions. Gaps are margins (mr-2/mb-2)
         because `gap` has no effect in inline flow; -mb-2 swallows the last
         line's bottom margin. -->
    <div class="-mb-2 flow-root">
      <div class="float-right mb-2 ml-2 flex h-10 items-center gap-2">
        <Button variant="secondary" size="sm" :disabled="isResetButtonDisabled" @click="$emit('reset-filters')">
          {{ $t('transactions.filters.reset') }}
        </Button>

        <slot name="actions" />
      </div>

      <slot name="prefix" />

      <!-- Filter picker: a multi-select menu of the optional filters. Rows keep
           their place and get a check mark when active, and the popover stays
           open so several filters can be toggled in one visit. -->
      <div class="mr-2 mb-2 inline-block align-top">
        <Popover.Popover>
          <Popover.PopoverTrigger
            class="border-input bg-input-background hover:bg-accent ring-offset-background focus-visible:ring-ring inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {{ $t('transactions.filters.filtersLabel') }}
            <ChevronDownIcon class="text-muted-foreground size-4" />
          </Popover.PopoverTrigger>

          <Popover.PopoverContent class="w-48 rounded-md p-1.5" align="start" :side-offset="4">
            <Button
              v-for="option in filterMenuOptions"
              :key="option.key"
              type="button"
              variant="ghost"
              class="h-auto w-full justify-between gap-2 px-2 py-1.5 font-normal"
              @click="toggleFilter(option.key)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <component :is="option.icon" class="text-muted-foreground size-4 shrink-0" />
                <span class="truncate">{{ option.label }}</span>
              </span>
              <CheckIcon v-if="option.active" class="size-4 shrink-0" />
            </Button>
          </Popover.PopoverContent>
        </Popover.Popover>
      </div>

      <!-- Always-visible filters -->
      <div class="mr-2 mb-2 inline-block w-56 align-top">
        <DateRangeFilter
          :start="filters.start"
          :end="filters.end"
          @update:range="emitFilters({ ...filters, start: $event.start, end: $event.end })"
        />
      </div>

      <div class="mr-2 mb-2 inline-block w-44 align-top">
        <AccountsFilter :accounts="filters.accounts" @update:accounts="emitFilters({ ...filters, accounts: $event })" />
      </div>

      <div class="mr-2 mb-2 inline-block w-44 align-top">
        <ComboboxCategories
          :category-ids="filters.categoryIds"
          @update:category-ids="emitFilters({ ...filters, categoryIds: $event })"
        />
      </div>

      <!-- User-added filters: one control per filter, "x" clears it and frees the space -->
      <div
        v-for="filterKey in extraFilters"
        :key="filterKey"
        class="mr-2 mb-2 inline-flex max-w-full items-stretch align-top"
      >
        <div v-if="filterKey === 'type'" class="w-36">
          <TransactionTypeFilter
            :value="filters.transactionType ?? undefined"
            @update:value="emitFilters({ ...filters, transactionType: $event })"
          />
        </div>

        <div v-else-if="filterKey === 'tags'" class="w-44">
          <TagFilter
            hide-clear-button
            :tag-ids="filters.tagIds"
            @update:tag-ids="emitFilters({ ...filters, tagIds: $event })"
          />
        </div>

        <div v-else-if="filterKey === 'payees'" class="w-44">
          <PayeeMultiSelectField
            hide-clear-button
            :payee-ids="filters.payeeIds"
            @update:payee-ids="emitFilters({ ...filters, payeeIds: $event })"
          />
        </div>

        <div v-else-if="filterKey === 'amount'" class="w-64">
          <AmountRangeFilter
            compact
            joined
            :amount-gte="filters.amountGte"
            :amount-lte="filters.amountLte"
            @update:amount-gte="emitFilters({ ...filters, amountGte: $event })"
            @update:amount-lte="emitFilters({ ...filters, amountLte: $event })"
          />
        </div>

        <!-- Wrapper div, not class on the component: its root (PopoverRoot) is renderless -->
        <div v-else-if="filterKey === 'transferKinds'" class="w-44">
          <TransferNatureFilter
            :transfer-natures="filters.transferNatures"
            :transfer-filter="filters.transferFilter"
            @update:transfer-natures="emitFilters({ ...filters, transferNatures: $event })"
          />
        </div>

        <!-- Pill toggles are borderless; box them like a field so the attached
             remove button reads as part of one control, same as the other chips -->
        <div
          v-else-if="filterKey === 'refunds'"
          class="border-input bg-input-background flex h-10 items-center rounded-md border px-3"
        >
          <OperationPills
            :label="$t('transactions.filters.refundsFilter.label')"
            :model-value="filters.refundFilter"
            @update:model-value="emitFilters({ ...filters, refundFilter: $event })"
          />
        </div>

        <div
          v-else-if="filterKey === 'transfers'"
          class="border-input bg-input-background flex h-10 items-center rounded-md border px-3"
        >
          <OperationPills
            :label="$t('transactions.filters.transferFilter.label')"
            :model-value="filters.transferFilter"
            @update:model-value="emitFilters({ ...filters, transferFilter: $event })"
          />
        </div>

        <div v-else-if="filterKey === 'note'" class="w-56">
          <NoteIncludesFilter
            compact
            :note-includes="filters.noteIncludes"
            @update:note-includes="emitFilters({ ...filters, noteIncludes: $event })"
          />
        </div>

        <!-- Fused remove segment: overlaps the control's right edge by exactly the
             rounded-md corner radius (10px = -ml-2.5) so the control's rounded
             corners are fully covered and the button's own left border reads as a
             divider line inside one continuous field. `relative` is load-bearing:
             InputField wraps its <input> in positioned divs, which would otherwise
             paint over the overlapping button and swallow the divider. -->
        <Button
          type="button"
          variant="ghost"
          :aria-label="$t('transactions.filters.removeFilter')"
          class="border-input bg-input-background text-muted-foreground hover:bg-accent hover:text-foreground relative -ml-2.5 h-auto w-7 shrink-0 rounded-none rounded-r-md border px-0 py-0"
          @click="removeFilter(filterKey)"
        >
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import ComboboxCategories from '@/components/common/combobox-categories.vue';
import { Button } from '@/components/lib/ui/button';
import * as Popover from '@/components/lib/ui/popover';
import { FiltersStruct } from '@/components/records-filters/const';
import { FILTER_ICONS } from '@/components/records-filters/filter-icons';
import { EXTRA_FILTERS, EXTRA_FILTER_KEYS, type ExtraFilterKey } from '@/components/records-filters/filter-registry';
import AmountRangeFilter from '@/components/records-filters/filters/amount-range-filter.vue';
import AccountsFilter from '@/components/records-filters/filters/combobox-accounts.vue';
import DateRangeFilter from '@/components/records-filters/filters/date-range-filter.vue';
import NoteIncludesFilter from '@/components/records-filters/filters/note-includes.vue';
import OperationPills from '@/components/records-filters/filters/operation-pills.vue';
import PayeeMultiSelectField from '@/components/fields/payee-multi-select-field.vue';
import TagFilter from '@/components/records-filters/filters/tag-filter.vue';
import TransactionTypeFilter from '@/components/records-filters/filters/transaction-type-filter.vue';
import TransferNatureFilter from '@/components/records-filters/filters/transfer-nature-filter.vue';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { CheckIcon, ChevronDownIcon, XIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { useExtraFilters } from './use-extra-filters';

const props = defineProps<{
  filters: FiltersStruct;
  isResetButtonDisabled: boolean;
}>();

const emit = defineEmits<{
  'update:filters': [value: FiltersStruct];
  'reset-filters': [];
}>();

const { t } = useI18n();

const { extraFilters, addExtraFilter, removeExtraFilter } = useExtraFilters();

const filterMenuOptions = computed(() =>
  EXTRA_FILTER_KEYS.map((key) => ({
    key,
    label: t(EXTRA_FILTERS[key].menuLabelKey),
    icon: FILTER_ICONS[key],
    active: extraFilters.value.includes(key),
  })),
);

const emitFilters = (value: FiltersStruct) => emit('update:filters', value);

const addFilter = (key: ExtraFilterKey) => {
  addExtraFilter(key);
  trackAnalyticsEvent({ event: 'transactions_filter_added', properties: { filter: key } });
};

const removeFilter = (key: ExtraFilterKey) => {
  removeExtraFilter(key);
  emitFilters({ ...props.filters, ...EXTRA_FILTERS[key].defaultSlice() });
  trackAnalyticsEvent({ event: 'transactions_filter_removed', properties: { filter: key } });
};

const toggleFilter = (key: ExtraFilterKey) => {
  if (extraFilters.value.includes(key)) removeFilter(key);
  else addFilter(key);
};
</script>
