<script setup lang="ts">
import { loadBudgetById } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import ResourceNotFound from '@/components/common/resource-not-found.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { isNotFoundError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { BUDGET_TYPES } from '@bt/shared/types';
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
const currentBudgetId = ref<string>(String(route.params.id));

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

const isNotFound = computed(() => isError.value && isNotFoundError(error.value));

watch(
  isError,
  (errored) => {
    if (!errored || isNotFound.value) return;
    addErrorNotification(t('errors.api.unexpectedError'));
    router.replace({ name: ROUTES_NAMES.plannedBudgets });
  },
  { immediate: true },
);

const isCategoryBudget = computed(() => budgetItem.value?.type === BUDGET_TYPES.category);
</script>

<template>
  <ResourceNotFound
    v-if="isNotFound"
    :title="t('budgets.notFound')"
    :description="t('budgets.notFoundDescription')"
    :link-label="t('budgets.backToList')"
    :link-to="{ name: ROUTES_NAMES.plannedBudgets }"
  />
  <BudgetDetailSkeleton v-else-if="isLoading || isError" />
  <CategoryBudgetInfo v-else-if="isCategoryBudget" />
  <ManualBudgetInfo v-else />
</template>
