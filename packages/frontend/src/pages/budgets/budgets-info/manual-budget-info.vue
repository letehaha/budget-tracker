<script setup lang="ts">
import { deleteBudget as deleteBudgetApi } from '@/api';
import { editBudget, loadBudgetById, loadBudgetStats } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AlertDialog } from '@/components/common';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import { buttonVariants } from '@/components/lib/ui/button';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { cloneDeep } from 'lodash-es';
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon, PencilIcon, Trash2Icon, WalletIcon } from 'lucide-vue-next';
import { ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import BudgetDetailSkeleton from './budget-detail-skeleton.vue';
import BudgetStatsCards from './shared/budget-stats-cards.vue';
import BudgetUtilizationBar from './shared/budget-utilization-bar.vue';
import { useBudgetDetails } from './shared/use-budget-details';
import TransactionsList from './transactions-list.vue';

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();
const budgetData = ref();
const currentBudgetId = ref<number>(Number(route.params.id));
const isEditDialogOpen = ref(false);

const { data: budgetStats } = useQuery({
  queryFn: () => loadBudgetStats({ budgetId: currentBudgetId.value }),
  queryKey: [...VUE_QUERY_CACHE_KEYS.budgetStats, currentBudgetId],
  staleTime: 30_000,
});

const { data: budgetItem, isLoading } = useQuery({
  queryFn: () => loadBudgetById(currentBudgetId.value),
  queryKey: [VUE_QUERY_CACHE_KEYS.budgetsListItem, currentBudgetId.value],
  staleTime: Infinity,
});

const { stats, formatDate, transactionDateRange, getBudgetTimeStatus, utilizationColor, utilizationTextColor } =
  useBudgetDetails({ budgetStats, budgetData });

const { mutate, isPending: isBudgetDataUpdating } = useMutation({
  mutationFn: editBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetStats });
  },
});

const handleSaveFromDialog = async () => {
  await mutate({
    budgetId: currentBudgetId.value,
    payload: {
      name: budgetData.value.name,
      limitAmount: budgetData.value.limitAmount,
    },
  });
  addSuccessNotification(t('budgets.list.updateSuccess'));
  isEditDialogOpen.value = false;
};

const handleDeleteBudget = async () => {
  try {
    await deleteBudgetApi(currentBudgetId.value);
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    addSuccessNotification(t('budgets.list.deleteSuccess'));
    router.push('/budgets');
  } catch {
    addErrorNotification(t('budgets.list.deleteError'));
  }
};

watchEffect(() => {
  if (!isLoading.value && budgetItem.value) {
    budgetData.value = cloneDeep(budgetItem.value);
  }
});
</script>

<template>
  <div v-if="budgetData" class="@container max-w-5xl p-6">
    <!-- Back Button & Header -->
    <div class="mb-6">
      <router-link
        to="/budgets"
        :class="[
          buttonVariants({ size: 'sm', variant: 'ghost' }),
          'text-muted-foreground hover:text-foreground mb-4 -ml-2 gap-1',
        ]"
      >
        <ChevronLeftIcon class="size-4" />
        {{ t('pages.budgetDetails.backToBudgets') }}
      </router-link>

      <!-- Hero Header -->
      <div class="flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div class="flex items-center gap-4">
          <div class="bg-muted flex size-12 shrink-0 items-center justify-center rounded-xl">
            <WalletIcon class="text-muted-foreground size-6" />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-semibold tracking-tight">{{ budgetData.name }}</h1>
              <span
                v-if="getBudgetTimeStatus"
                :class="[
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  getBudgetTimeStatus?.status === 'ended'
                    ? 'bg-muted text-muted-foreground'
                    : getBudgetTimeStatus?.status === 'upcoming'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-success-text/10 text-success-text',
                ]"
              >
                {{ getBudgetTimeStatus?.text }}
              </span>
            </div>
            <!-- Transaction Date Range (based on actual linked transactions) -->
            <div v-if="transactionDateRange" class="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
              <CalendarIcon class="size-3.5" />
              <span v-if="transactionDateRange.first && transactionDateRange.last">
                {{ transactionDateRange.first }}
                <ArrowRightIcon class="inline size-3" />
                {{ transactionDateRange.last }}
              </span>
              <span v-else-if="transactionDateRange.first">{{ transactionDateRange.first }}</span>
              <span v-else-if="transactionDateRange.last">{{ transactionDateRange.last }}</span>
            </div>
            <p v-else class="text-muted-foreground mt-1 text-sm">{{ t('pages.budgetDetails.noTransactionsYet') }}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2">
          <ResponsiveDialog v-model:open="isEditDialogOpen">
            <template #trigger>
              <Button variant="outline" size="sm">
                <PencilIcon class="mr-2 size-4" />
                {{ $t('budgets.manualBudget.edit') }}
              </Button>
            </template>
            <template #title>{{ $t('budgets.manualBudget.editTitle') }}</template>
            <div class="grid gap-4">
              <InputField
                v-model="budgetData.name"
                :label="$t('budgets.settings.nameLabel')"
                :placeholder="$t('budgets.settings.namePlaceholder')"
                class="w-full"
                :disabled="isBudgetDataUpdating"
              />
              <InputField
                v-model="budgetData.limitAmount"
                :label="$t('budgets.settings.limitLabel')"
                :placeholder="$t('budgets.settings.limitPlaceholder')"
                type="number"
                class="w-full"
                :disabled="isBudgetDataUpdating"
              />
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-muted-foreground mb-1.5 block text-sm font-medium">
                    {{ $t('budgets.settings.startDateLabel') }}
                  </label>
                  <div
                    class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
                  >
                    {{ formatDate(budgetData.startDate) || 'Not set' }}
                  </div>
                </div>
                <div>
                  <label class="text-muted-foreground mb-1.5 block text-sm font-medium">
                    {{ $t('budgets.settings.endDateLabel') }}
                  </label>
                  <div
                    class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
                  >
                    {{ formatDate(budgetData.endDate) || 'Not set' }}
                  </div>
                </div>
              </div>
              <Button @click="handleSaveFromDialog" :disabled="isBudgetDataUpdating" class="w-full">
                <template v-if="isBudgetDataUpdating">{{ t('common.actions.saving') }}</template>
                <template v-else>{{ t('common.actions.saveChanges') }}</template>
              </Button>
            </div>
          </ResponsiveDialog>

          <AlertDialog
            :title="$t('budgets.list.deleteDialog.title')"
            accept-variant="destructive"
            @accept="handleDeleteBudget"
          >
            <template #description>
              {{ $t('budgets.list.deleteDialog.description') }}
            </template>
            <template #trigger>
              <Button variant="outline" size="sm" class="text-destructive-text hover:bg-destructive-text/10">
                <Trash2Icon class="size-4" />
              </Button>
            </template>
          </AlertDialog>
        </div>
      </div>
    </div>

    <BudgetStatsCards :stats="stats" />

    <BudgetUtilizationBar
      v-if="budgetData.limitAmount"
      :limit-amount="budgetData.limitAmount"
      :stats="stats"
      :utilization-color="utilizationColor"
      :utilization-text-color="utilizationTextColor"
    />

    <!-- Transactions Section -->
    <div>
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-medium">{{ t('pages.budgetDetails.transactions') }}</h2>
          <p class="text-muted-foreground text-sm">
            {{ t('pages.budgetDetails.transactionsLinked', stats.transactionsCount) }}
          </p>
        </div>
      </div>

      <TransactionsList :budgetId="currentBudgetId" :isBudgetDataUpdating="isBudgetDataUpdating" />
    </div>
  </div>

  <!-- Loading State -->
  <BudgetDetailSkeleton v-else />
</template>
