<script setup lang="ts">
import { loadBudgetById } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { API_ERROR_CODES, BUDGET_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import BudgetDetailSkeleton from './budget-detail-skeleton.vue';
import CategoryBudgetInfo from './category-budget-info.vue';
import ManualBudgetInfo from './manual-budget-info.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { addErrorNotification } = useNotificationCenter();
const currentBudgetId = ref<number>(Number(route.params.id));

const {
  data: budgetItem,
  isLoading,
  isError,
  error,
} = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
  retry: false,
});

watch(
  isError,
  (errored) => {
    if (!errored) return;
    const isNotFound =
      error.value instanceof ApiErrorResponseError && error.value.data.code === API_ERROR_CODES.notFound;
    addErrorNotification(isNotFound ? t('budgets.notFound') : t('errors.api.unexpectedError'));
    router.replace({ name: ROUTES_NAMES.plannedBudgets });
  },
  { immediate: true },
);

const isCategoryBudget = computed(() => budgetItem.value?.type === BUDGET_TYPES.category);
</script>

<template>
  <BudgetDetailSkeleton v-if="isLoading || isError" />
  <CategoryBudgetInfo v-else-if="isCategoryBudget" />
  <ManualBudgetInfo v-else />
</template>
