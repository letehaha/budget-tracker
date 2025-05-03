import { ref } from "vue";
import { BudgetModel } from "@bt/shared/types";
import { defineStore } from "pinia";
import { loadSystemBudgets, loadBudgetById } from "@/api/budgets";
import { useNotificationCenter } from "@/components/notification-center";
import * as errors from "@/js/errors";

export const useBudgetsStore = defineStore("budgets", () => {
  const notificationStore = useNotificationCenter();
  const budgetsList = ref<BudgetModel[]>([]);
  const budgetItem = ref<BudgetModel>();

  const loadBudgets = async () => {
    try {
      const result = await loadSystemBudgets();

      if (result?.length) budgetsList.value = result;
    } catch (err) {
      if (!(err instanceof errors.AuthError)) {
        notificationStore.addErrorNotification("Cannot load budgets");
      }
    }
  };

  const loadBudgetByPk = async (id: number) => {
    try {
      const result = await loadBudgetById(id);

      budgetItem.value = result;
    } catch {
      notificationStore.addErrorNotification("Cannot load budget");
    }
  };

  return {
    loadBudgets,
    loadBudgetByPk,
    budgetsList,
  };
});
