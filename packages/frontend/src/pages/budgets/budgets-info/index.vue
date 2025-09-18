<script setup lang="ts">
import { editBudget, loadBudgetById, loadBudgetStats } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import { buttonVariants } from '@/components/lib/ui/button';
import Button from '@/components/lib/ui/button/Button.vue';
import Card from '@/components/lib/ui/card/Card.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { toLocalNumber } from '@/js/helpers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { cloneDeep } from 'lodash-es';
import { ChevronLeftIcon } from 'lucide-vue-next';
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import TransactionsList from './transactions-list.vue';

const route = useRoute();
const queryClient = useQueryClient();
const { formatBaseCurrency } = useFormatCurrency();
const { addSuccessNotification } = useNotificationCenter();
const budgetData = ref();
const currentBudgetId = ref<number>(Number(route.params.id));
const DEFAULT_CHANGE_DATA: {
  name: string | null;
  limitAmount?: number | null;
} = {
  name: null,
  limitAmount: 0,
} as const;

const changeForm = ref({ ...DEFAULT_CHANGE_DATA });

const { data: budgetStats } = useQuery({
  queryFn: () => loadBudgetStats({ budgetId: currentBudgetId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId],
  staleTime: 30_000,
});

const stats = computed(() => ({
  expenses: budgetStats.value?.summary.actualExpense || 0,
  income: budgetStats.value?.summary.actualIncome || 0,
  diff: budgetStats.value?.summary.balance || 0,
  limitUsed: budgetStats.value?.summary.utilizationRate,
}));

const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const { mutate, isPending: isBudgetDataUpdating } = useMutation({
  mutationFn: editBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetStats });
  },
});

const toggleBudgetChanges = async () => {
  await mutate({ budgetId: currentBudgetId.value, payload: changeForm.value });
  addSuccessNotification('Updated');
};

watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
    budgetData.value.startDate = new Date(budgetData.value.startDate);
    budgetData.value.endDate = new Date(budgetData.value.endDate);
  }
});
</script>

<template>
  <div v-if="budgetData" class="relative flex w-min max-w-full flex-col gap-4 p-4 lg:w-auto lg:flex-row xl:gap-20">
    <div
      class="@[360px]/budget-item-info:w-full grid h-max gap-4 lg:sticky lg:top-(--header-height) lg:w-[450px] lg:max-w-[450px]"
    >
      <div class="flex items-center gap-4">
        <router-link
          to="/budgets"
          :class="
            buttonVariants({
              size: 'sm',
              variant: 'secondary',
            })
          "
        >
          <ChevronLeftIcon class="size-4" />
        </router-link>
        <h1 class="text-2xl tracking-wider">Budget Info</h1>
      </div>

      <Card class="flex flex-col gap-5 p-4">
        <InputField
          v-model="budgetData.name"
          label="Budget name"
          autofocus
          placeholder="Name"
          class="w-full"
          @click.stop
          :disabled="isBudgetDataUpdating"
        />

        <InputField
          v-model="budgetData.limitAmount"
          label="Budget category"
          placeholder="Budget category"
          class="w-full"
          @click.stop
          :disabled="isBudgetDataUpdating"
        />

        <div class="@[450px]/budget-item-info:flex-col flex justify-between gap-4">
          <DateField :model-value="budgetData.startDate" disabled :calendar-mode="'date'" label="From date" />
          <DateField :model-value="budgetData.endDate" disabled label="To date" />
        </div>

        <div class="flex gap-2">
          <Button variant="default" class="w-full" @click="toggleBudgetChanges" :disabled="isBudgetDataUpdating">
            <template v-if="isBudgetDataUpdating"> Changing... </template>
            <template v-else> Update </template>
          </Button>
        </div>
      </Card>

      <Card class="p-4">
        <h3 class="mb-4 text-xl">Cash flow</h3>

        <div class="grid gap-2">
          <p>Total expenses: {{ formatBaseCurrency(stats.expenses) }}</p>
          <p>Total income: {{ formatBaseCurrency(stats.income) }}</p>
          <p>
            Total balance diff:
            <span :class="[{ 'text-app-expense-color': stats.diff < 0, 'text-app-income-color': stats.diff > 0 }]">
              {{ formatBaseCurrency(stats.diff) }}</span
            >
          </p>
          <p>Budget limit used: {{ stats.limitUsed ? `${toLocalNumber(stats.limitUsed)}%` : 'N/A' }}</p>
        </div>
      </Card>
    </div>

    <TransactionsList :budgetId="currentBudgetId" :isBudgetDataUpdating="isBudgetDataUpdating" />
  </div>
</template>
