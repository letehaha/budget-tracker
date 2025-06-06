<script setup lang="ts">
import { deleteBudget as deleteBudgetApi } from '@/api';
import { loadSystemBudgets } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AlertDialog } from '@/components/common';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ROUTES_NAMES } from '@/routes';
import { useCurrenciesStore } from '@/stores/currencies';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { EditIcon, Trash2Icon } from 'lucide-vue-next';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const router = useRouter();
const queryClient = useQueryClient();
const { baseCurrency } = useCurrenciesStore();
const isModalVisible = ref<boolean>(false);
const { data: budgetsList } = useQuery({
  queryFn: () => loadSystemBudgets(),
  queryKey: VUE_QUERY_CACHE_KEYS.budgetsList,
  staleTime: Infinity,
  placeholderData: [],
});
const toggleDeleteModal = () => {
  isModalVisible.value = true;
};
const toggleBudgetNameEdit = (budgetId: number) => {
  router.push({ name: ROUTES_NAMES.budgetsInfo, params: { id: budgetId } });
};
const deleteBudget = async (budgetId: number) => {
  try {
    await deleteBudgetApi(budgetId);
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    addSuccessNotification('Budget deleted successfully!');
  } catch {
    addErrorNotification('Unexpected error!');
  }
};
</script>

<template>
  <div>
    <template v-if="budgetsList.length">
      <div v-for="budget in budgetsList" :key="budget.id" class="flex items-center justify-between rounded-md p-2">
        <div class="flex flex-col gap-1">
          <div class="w-min overflow-hidden text-ellipsis whitespace-nowrap">Name: {{ budget.name }}</div>
          <div class="w-min overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            Limit Amount:

            <template v-if="budget.limitAmount"> {{ budget.limitAmount }} {{ baseCurrency.currency.code }} </template>
            <template v-else> N/A </template>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <Button size="sm" @click="toggleBudgetNameEdit(budget.id)">
            <span class="@[360px]/budgets-list:inline"> Edit </span>
            <EditIcon class="size-4" />
          </Button>

          <AlertDialog
            title="Do you want to delete this budget?"
            accept-variant="destructive"
            @accept="deleteBudget(budget.id)"
          >
            <template #description>
              By clicking "Accept," all associated transactions will be unlinked from the budget but will remain in the
              system.
            </template>
            <template #trigger>
              <Button variant="destructive" size="sm" class="w-min" @click.stop="toggleDeleteModal">
                <span class="@[360px]/budgets-list:inline"> Delete </span>
                <Trash2Icon class="size-4" />
              </Button>
            </template>
          </AlertDialog>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="bg-card w-full min-w-full rounded-md px-6 py-4 text-center">No budgets available</div>
    </template>
  </div>
</template>
