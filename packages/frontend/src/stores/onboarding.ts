import {
  getOnboardingState as fetchOnboardingStateApi,
  updateOnboardingState as updateOnboardingStateApi,
} from '@/api/onboarding';
import { ROUTES_NAMES } from '@/routes/constants';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface OnboardingTask {
  id: string;
  title: string;
  description?: string;
  route?: string;
}

export interface OnboardingCategory {
  id: string;
  title: string;
  icon: string;
  tasks: OnboardingTask[];
}

// Define all onboarding categories and tasks
const ONBOARDING_CATEGORIES: OnboardingCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket',
    tasks: [
      {
        id: 'create-account',
        title: 'Create your first account',
        description: 'Add a bank account or wallet to track',
        route: ROUTES_NAMES.accounts,
      },
      {
        id: 'add-transaction',
        title: 'Add your first transaction',
        description: 'Record an income or expense',
        route: ROUTES_NAMES.transactions,
      },
    ],
  },
  {
    id: 'advanced-transactions',
    title: 'Advanced Transactions',
    icon: 'layers',
    tasks: [
      {
        id: 'create-transfer',
        title: 'Create a transfer',
        description: 'Move money between your accounts',
        route: ROUTES_NAMES.transactions,
      },
      {
        id: 'link-refund',
        title: 'Link a refund',
        description: 'Connect refunds to original purchases',
        route: ROUTES_NAMES.transactions,
      },
      {
        id: 'link-transactions',
        title: 'Link existing transactions',
        description: 'Connect related transactions together',
        route: ROUTES_NAMES.transactions,
      },
      {
        id: 'split-transaction',
        title: 'Split a transaction',
        description: 'Divide expenses across categories',
        route: ROUTES_NAMES.transactions,
      },
      {
        id: 'mark-transfer-out',
        title: 'Mark transfer out of wallet',
        description: 'Track money leaving your accounts',
        route: ROUTES_NAMES.transactions,
      },
    ],
  },
  {
    id: 'organization',
    title: 'Organize Your Finances',
    icon: 'folder',
    tasks: [
      {
        id: 'create-category',
        title: 'Create a custom category',
        description: 'Organize your transactions by type',
        route: ROUTES_NAMES.settingsCategories,
      },
      {
        id: 'create-tag',
        title: 'Create a tag',
        description: 'Add tags to group related transactions',
        route: ROUTES_NAMES.settingsTags,
      },
      {
        id: 'create-budget',
        title: 'Set up a budget',
        description: 'Create spending limits for categories',
        route: ROUTES_NAMES.budgets,
      },
      {
        id: 'create-account-group',
        title: 'Create an account group',
        description: 'Organize accounts by type or purpose',
        route: ROUTES_NAMES.settingsAccounts,
      },
      {
        id: 'setup-tag-reminder',
        title: 'Set up a tag reminder',
        description: 'Get notified about recurring expenses',
        route: ROUTES_NAMES.settingsTags,
      },
    ],
  },
  {
    id: 'bank-import',
    title: 'Connect & Import',
    icon: 'link',
    tasks: [
      {
        id: 'connect-bank',
        title: 'Connect a bank account',
        description: 'Sync transactions automatically',
        route: ROUTES_NAMES.accountIntegrations,
      },
      {
        id: 'import-csv',
        title: 'Import from any text source',
        description: 'Import from CSV, PDF, or bank statements',
        route: ROUTES_NAMES.settingsDataManagement,
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Explore Analytics',
    icon: 'chart',
    tasks: [
      {
        id: 'view-annual-overview',
        title: 'Check annual overview',
        description: 'See yearly trends and patterns',
        route: ROUTES_NAMES.analytics,
      },
      {
        id: 'view-cash-flow',
        title: 'View cash flow analytics',
        description: 'Understand your income vs expenses',
        route: ROUTES_NAMES.analyticsCashFlow,
      },
    ],
  },
  {
    id: 'ai-settings',
    title: 'AI Features',
    icon: 'sparkles',
    tasks: [
      {
        id: 'review-ai-features',
        title: 'Review AI features',
        description: 'Explore available AI capabilities',
        route: ROUTES_NAMES.settingsAiFeatures,
      },
      {
        id: 'configure-ai',
        title: 'Set your own API key',
        description: 'Use your API key for AI features',
        route: ROUTES_NAMES.settingsAiKeys,
      },
    ],
  },
];

export const useOnboardingStore = defineStore('onboarding', () => {
  // State
  const completedTasks = ref<string[]>([]);
  const isDismissed = ref(false);
  const dismissedAt = ref<string | null>(null);
  const isPanelOpen = ref(false);
  const expandedCategories = ref<string[]>([]);
  const isLoading = ref(false);
  const isInitialized = ref(false);

  // Getters
  const categories = computed(() => ONBOARDING_CATEGORIES);

  const allTasks = computed(() => ONBOARDING_CATEGORIES.flatMap((c) => c.tasks));

  const totalTasks = computed(() => allTasks.value.length);

  // Only count tasks that exist in the current task list (filters out old/removed task IDs)
  const validTaskIds = computed(() => new Set(allTasks.value.map((t) => t.id)));
  const completedCount = computed(() => completedTasks.value.filter((id) => validTaskIds.value.has(id)).length);

  const progressPercentage = computed(() => Math.round((completedCount.value / totalTasks.value) * 100));

  const isAllComplete = computed(() => completedCount.value === totalTasks.value);

  const remainingCount = computed(() => totalTasks.value - completedCount.value);

  const shouldShowTrigger = computed(() => !isDismissed.value && isInitialized.value);

  const isTaskCompleted = (taskId: string): boolean => completedTasks.value.includes(taskId);

  const getCategoryProgress = (categoryId: string): { completed: number; total: number } => {
    const category = ONBOARDING_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return { completed: 0, total: 0 };
    const completed = category.tasks.filter((t) => isTaskCompleted(t.id)).length;
    return { completed, total: category.tasks.length };
  };

  const isCategoryExpanded = (categoryId: string): boolean => expandedCategories.value.includes(categoryId);

  const isCategoryComplete = (categoryId: string): boolean => {
    const progress = getCategoryProgress(categoryId);
    return progress.completed === progress.total;
  };

  // Actions
  const fetchOnboardingState = async () => {
    isLoading.value = true;
    try {
      const data = await fetchOnboardingStateApi();
      completedTasks.value = data.completedTasks;
      isDismissed.value = data.isDismissed;
      dismissedAt.value = data.dismissedAt;
      isInitialized.value = true;

      // Auto-open panel on first visit if not dismissed and not all complete
      if (!data.isDismissed && completedTasks.value.length < allTasks.value.length) {
        isPanelOpen.value = true;

        // Expand the first category that has incomplete tasks
        const firstIncompleteCategory = ONBOARDING_CATEGORIES.find((category) => {
          const hasIncompleteTasks = category.tasks.some((task) => !completedTasks.value.includes(task.id));
          return hasIncompleteTasks;
        });
        if (firstIncompleteCategory) {
          expandedCategories.value = [firstIncompleteCategory.id];
        }
      }
    } catch (error) {
      console.error('Failed to fetch onboarding state:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const completeTask = async (taskId: string) => {
    if (completedTasks.value.includes(taskId)) return;

    // Optimistically update UI
    completedTasks.value = [...completedTasks.value, taskId];

    try {
      await updateOnboardingStateApi({
        state: { completedTasks: completedTasks.value },
      });
    } catch (error) {
      // Revert on failure
      completedTasks.value = completedTasks.value.filter((id) => id !== taskId);
      console.error('Failed to complete task:', error);
    }
  };

  const dismissPermanently = async () => {
    const now = new Date().toISOString();
    isDismissed.value = true;
    dismissedAt.value = now;
    isPanelOpen.value = false;

    try {
      await updateOnboardingStateApi({
        state: { isDismissed: true, dismissedAt: now },
      });
    } catch (error) {
      // Revert on failure
      isDismissed.value = false;
      dismissedAt.value = null;
      console.error('Failed to dismiss onboarding:', error);
    }
  };

  const reopen = async () => {
    isDismissed.value = false;
    dismissedAt.value = null;

    try {
      await updateOnboardingStateApi({
        state: { isDismissed: false, dismissedAt: null },
      });
    } catch (error) {
      console.error('Failed to reopen onboarding:', error);
    }
  };

  const toggleCategory = (categoryId: string) => {
    const index = expandedCategories.value.indexOf(categoryId);
    if (index === -1) {
      expandedCategories.value.push(categoryId);
    } else {
      expandedCategories.value.splice(index, 1);
    }
  };

  const openPanel = () => {
    isPanelOpen.value = true;
  };

  const closePanel = () => {
    isPanelOpen.value = false;
  };

  const reset = () => {
    completedTasks.value = [];
    isDismissed.value = false;
    dismissedAt.value = null;
    isPanelOpen.value = false;
    expandedCategories.value = [];
    isInitialized.value = false;
  };

  return {
    // State
    completedTasks,
    isDismissed,
    dismissedAt,
    isPanelOpen,
    expandedCategories,
    isLoading,
    isInitialized,

    // Getters
    categories,
    allTasks,
    totalTasks,
    completedCount,
    progressPercentage,
    isAllComplete,
    remainingCount,
    shouldShowTrigger,
    isTaskCompleted,
    getCategoryProgress,
    isCategoryExpanded,
    isCategoryComplete,

    // Actions
    fetchOnboardingState,
    completeTask,
    dismissPermanently,
    reopen,
    toggleCategory,
    openPanel,
    closePanel,
    reset,
  };
});
