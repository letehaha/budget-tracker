<script setup lang="ts">
import Button from "@/components/lib/ui/button/Button.vue";
import { EditIcon, Trash2Icon } from "lucide-vue-next";
import { AlertDialog } from "@/components/common";
import { loadSystemBudgets } from "@/api/budgets";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { VUE_QUERY_CACHE_KEYS } from "@/common/const";
import { deleteBudget as deleteBudgetApi } from "@/api";
import { useNotificationCenter } from "@/components/notification-center";
import { useRouter } from "vue-router";
import { ROUTES_NAMES } from "@/routes";
import { useCurrenciesStore } from "@/stores/currencies";
import { ref } from "vue";
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
    addSuccessNotification("Budget deleted successfully!");
  } catch {
    addErrorNotification("Unexpected error!");
  }
};
</script>

<template>
  <div class="mt-4">
    <template v-if="budgetsList.length">
      <div
        v-for="budget in budgetsList"
        :key="budget.id"
        class="flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer"
      >
        <div class="flex flex-col gap-1">
          <div class="whitespace-nowrap text-ellipsis overflow-hidden w-min">
            Name: {{ budget.name }}
          </div>
          <div class="whitespace-nowrap text-ellipsis overflow-hidden w-min text-sm">
            Limit Amount: {{ budget.limitAmount }} {{ baseCurrency.currency.code }}
          </div>
        </div>
        <div class="flex justify-between items-center gap-2">
          <Button size="sm" @click="toggleBudgetNameEdit(budget.id)">
            <span class="@[360px]/budgets-list:inline"> Edit </span>
            <EditIcon class="size-4" />
          </Button>
          <!-- <Button size="sm" variant="destructive" @click="deleteBudget(budget.id)">
          <span class="@[360px]/budgets-list:inline"> Delete </span>
          <Trash2Icon class="size-4" />
        </Button> -->

          <AlertDialog
            title="Do you want to delete this budget?"
            accept-variant="destructive"
            @accept="deleteBudget(budget.id)"
          >
            <template #trigger>
              <Button
                variant="destructive"
                size="sm"
                class="w-min gap-1"
                @click.stop="toggleDeleteModal"
              >
                <span class="@[360px]/budgets-list:inline"> Delete </span>
                <Trash2Icon class="size-4" />
              </Button>
            </template>
          </AlertDialog>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="min-w-full w-full bg-card rounded-md px-6 py-4 text-center">
        No budgets available
      </div>
    </template>
  </div>
</template>
