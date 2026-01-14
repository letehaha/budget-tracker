<script setup lang="ts">
import { loadBudgetById } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { BUDGET_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import BudgetDetailSkeleton from './budget-detail-skeleton.vue';
import CategoryBudgetInfo from './category-budget-info.vue';
import ManualBudgetInfo from './manual-budget-info.vue';

const route = useRoute();
const currentBudgetId = ref<number>(Number(route.params.id));

const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const isCategoryBudget = computed(() => budgetItem.value?.type === BUDGET_TYPES.category);
</script>

<template>
  <BudgetDetailSkeleton v-if="isLoading" />
  <CategoryBudgetInfo v-else-if="isCategoryBudget" />
  <ManualBudgetInfo v-else />
</template>
