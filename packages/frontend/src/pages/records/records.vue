<template>
  <div class="p-4">
    <div class="flex w-min max-w-full flex-col gap-4 lg:w-auto lg:flex-row xl:gap-20">
      <template v-if="!hideFilters">
        <Card class="sticky top-[var(--header-height)] h-min min-w-[350px] p-4">
          <div class="grid gap-4">
            <DateField
              v-model="filters.start"
              :calendar-options="{
                maxDate: filters.end,
              }"
              label="From date"
            />
            <DateField
              v-model="filters.end"
              :calendar-options="{
                minDate: filters.start,
              }"
              label="To date"
            />

            <div>
              <p class="mb-2">Transaction type:</p>

              <RadioGroup v-model="filters.transactionType" :default-value="null" class="flex flex-wrap gap-2">
                <label class="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem :value="null" />
                  <p class="text-sm">Both</p>
                </label>
                <label class="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem :value="TRANSACTION_TYPES.income" />
                  <p class="text-sm">Income</p>
                </label>
                <label class="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem :value="TRANSACTION_TYPES.expense" />
                  <p class="text-sm">Expense</p>
                </label>
              </RadioGroup>
            </div>

            <div class="flex gap-2">
              <InputField v-model="filters.amountGte" label="Amount from (gte)" placeholder=">= than" />
              <InputField v-model="filters.amountLte" label="To (lte)" placeholder="<= than" />
            </div>

            <div>
              <p class="mb-2">Exlude:</p>

              <div class="flex gap-2">
                <label class="flex cursor-pointer items-center gap-2">
                  <Checkbox :checked="filters.excludeRefunds" @update:checked="filters.excludeRefunds = $event" />
                  Refunds
                </label>
                <label class="flex cursor-pointer items-center gap-2">
                  <Checkbox :checked="filters.excludeTransfer" @update:checked="filters.excludeTransfer = $event" />
                  Transfers
                </label>
              </div>
            </div>

            <Collapsible.Collapsible v-model:open="isOpen">
              <Collapsible.CollapsibleTrigger class="flex w-full items-center gap-2 text-left">
                <template v-if="isOpen">
                  <ChevronUpIcon />
                </template>
                <template v-else>
                  <ChevronDownIcon />
                </template>
                Accounts
              </Collapsible.CollapsibleTrigger>

              <Collapsible.CollapsibleContent>
                <div class="grid gap-2 pl-4 pt-4">
                  <Separator />

                  <div class="flex items-center justify-between gap-2">
                    <span> Exchange Rate: </span>
                  </div>

                  <Separator />

                  <div class="flex items-center justify-between gap-2">
                    <span> Exchange Rate Live Update: </span>
                  </div>
                </div>
              </Collapsible.CollapsibleContent>
            </Collapsible.Collapsible>
          </div>

          <div class="mt-8 flex gap-2">
            <UiButton
              variant="secondary"
              :disabled="isResetButtonDisabled"
              class="w-full flex-shrink"
              @click="resetFilters"
            >
              Reset
            </UiButton>

            <template v-if="isFiltersOutOfSync">
              <UiButton variant="default" class="w-full flex-shrink" @click="applyFilters"> Apply </UiButton>
            </template>
          </div>
        </Card>
      </template>
      <template v-else>
        <div class="flex items-center justify-between">
          <p>Filters:</p>

          <Dialog.Dialog v-model:open="isFiltersDialogOpen">
            <Dialog.DialogTrigger as-child>
              <UiButton variant="ghost" size="icon" class="ml-auto">
                <div class="relative">
                  <ListFilterIcon />

                  <template v-if="isAnyFiltersApplied">
                    <div class="bg-primary absolute -right-1 -top-1 size-3 rounded-full" />
                  </template>
                </div>
              </UiButton>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent class="max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-md">
              <Dialog.DialogHeader class="mb-6">
                <Dialog.DialogTitle> Select filters </Dialog.DialogTitle>
              </Dialog.DialogHeader>

              <div class="grid gap-4">
                <DateField
                  v-model="filters.start"
                  :calendar-options="{
                    maxDate: filters.end,
                  }"
                  label="From date"
                />
                <DateField
                  v-model="filters.end"
                  :calendar-options="{
                    minDate: filters.start,
                  }"
                  label="To date"
                />

                <div>
                  <p class="mb-2">Transaction type:</p>

                  <RadioGroup v-model="filters.transactionType" :default-value="null" class="flex flex-wrap gap-2">
                    <label class="flex cursor-pointer items-center gap-2">
                      <RadioGroupItem :value="null" />
                      <p class="text-sm">Both</p>
                    </label>
                    <label class="flex cursor-pointer items-center gap-2">
                      <RadioGroupItem :value="TRANSACTION_TYPES.income" />
                      <p class="text-sm">Income</p>
                    </label>
                    <label class="flex cursor-pointer items-center gap-2">
                      <RadioGroupItem :value="TRANSACTION_TYPES.expense" />
                      <p class="text-sm">Expense</p>
                    </label>
                  </RadioGroup>
                </div>

                <div class="flex gap-2">
                  <InputField v-model="filters.amountGte" label="Amount from (gte)" placeholder=">= than" />
                  <InputField v-model="filters.amountLte" label="To (lte)" placeholder="<= than" />
                </div>

                <div>
                  <p class="mb-2">Exlude:</p>

                  <div class="flex gap-2">
                    <label class="flex cursor-pointer items-center gap-2">
                      <Checkbox :checked="filters.excludeRefunds" @update:checked="filters.excludeRefunds = $event" />
                      Refunds
                    </label>
                    <label class="flex cursor-pointer items-center gap-2">
                      <Checkbox :checked="filters.excludeTransfer" @update:checked="filters.excludeTransfer = $event" />
                      Transfers
                    </label>
                  </div>
                </div>
              </div>

              <div class="mt-8 flex gap-2">
                <UiButton
                  variant="secondary"
                  :disabled="isResetButtonDisabled"
                  class="w-full flex-shrink"
                  @click="resetFilters"
                >
                  Reset
                </UiButton>

                <template v-if="isFiltersOutOfSync">
                  <UiButton variant="default" class="w-full flex-shrink" @click="applyFilters"> Apply </UiButton>
                </template>
              </div>
            </Dialog.DialogContent>
          </Dialog.Dialog>
        </div>
      </template>

      <Card class="w-screen max-w-full rounded-md px-2 py-4 sm:max-w-[450px] sm:p-6">
        <div>
          <template v-if="isFetched && transactionsPages">
            <TransactionsList :transactions="transactionsPages.pages.flat()" />
          </template>
        </div>
        <template v-if="hasNextPage">
          <UiButton type="button" variant="secondary" class="mt-8 w-full" @click="() => fetchNextPage()">
            Load more
          </UiButton>
        </template>
        <template v-else>
          <p>No more data to load</p>
        </template>
      </Card>
    </div>

    <UiButton
      size="icon"
      :class="
        cn(
          'invisible fixed bottom-7 right-7 size-[50px] translate-y-2 rounded-full opacity-0 transition-transform duration-300',
          showScrollTopBtn && 'visible translate-y-0 opacity-100',
        )
      "
      @click="scrollTop"
    >
      Top
    </UiButton>
  </div>
</template>

<script lang="ts" setup>
import { loadTransactions } from '@/api/transactions';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { removeValuesFromObject } from '@/common/utils/remove-values-from-object';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Card } from '@/components/lib/ui/card';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import * as Collapsible from '@/components/lib/ui/collapsible';
import * as Dialog from '@/components/lib/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/lib/ui/radio-group';
import TransactionsList from '@/components/transactions-list/transactions-list.vue';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { useWindowScroll } from '@vueuse/core';
import isDate from 'date-fns/isDate';
import { isEqual } from 'lodash-es';
import { ChevronDownIcon, ChevronUpIcon, ListFilterIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const limit = 30;

const DEFAULT_FILTERS: {
  start: Date | null;
  end: Date | null;
  transactionType: TRANSACTION_TYPES | null;
  amountGte: number | null;
  amountLte: number | null;
  excludeRefunds: boolean;
  excludeTransfer: boolean;
} = {
  // TODO: by user-currencies
  // TODO: by accounts
  // TODO: by categories
  start: null,
  end: null,
  transactionType: null,
  amountGte: null,
  amountLte: null,
  excludeRefunds: false,
  excludeTransfer: false,
};

const isFiltersDialogOpen = ref(false);
const filters = ref({ ...DEFAULT_FILTERS });
const appliedFilters = ref({ ...DEFAULT_FILTERS });
const isOpen = ref(false);

const isResetButtonDisabled = computed(() => isEqual(filters.value, DEFAULT_FILTERS));
const isAnyFiltersApplied = computed(() => !isEqual(appliedFilters.value, DEFAULT_FILTERS));
const isFiltersOutOfSync = computed(() => !isEqual(filters.value, appliedFilters.value));
const resetFilters = () => {
  filters.value = { ...DEFAULT_FILTERS };
  appliedFilters.value = { ...DEFAULT_FILTERS };
  isFiltersDialogOpen.value = false;
};
const applyFilters = () => {
  appliedFilters.value = { ...filters.value };
  isFiltersDialogOpen.value = false;
};

const hideFilters = useWindowBreakpoints(1024);

const fetchTransactions = ({ pageParam, filter }: { pageParam: number; filter: typeof appliedFilters.value }) => {
  const from = pageParam * limit;

  return loadTransactions(
    removeValuesFromObject<Parameters<typeof loadTransactions>[0]>({
      limit,
      from,
      transactionType: filter.transactionType,
      endDate: isDate(filter.end) ? filter.end.toISOString() : undefined,
      startDate: isDate(filter.start) ? filter.start.toISOString() : undefined,
      amountGte: filter.amountGte,
      amountLte: filter.amountLte,
      excludeRefunds: filter.excludeRefunds,
      excludeTransfer: filter.excludeTransfer,
    }),
  );
};

const {
  data: transactionsPages,
  fetchNextPage,
  hasNextPage,
  isFetched,
} = useInfiniteQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.recordsPageRecordsList, appliedFilters],
  queryFn: ({ pageParam }) => fetchTransactions({ pageParam, filter: appliedFilters.value }),
  initialPageParam: 0,
  getNextPageParam: (lastPage, pages) => {
    // No more pages to load
    if (lastPage.length < limit) return undefined;
    // returns the number of pages fetched so far as the next page param
    return pages.length;
  },
  staleTime: 1_000 * 60,
});

const { y: scrollY } = useWindowScroll();
const showScrollTopBtn = computed(() => scrollY.value > 300);

const scrollTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
</script>
