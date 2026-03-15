<script setup lang="ts">
import Card from '@/components/lib/ui/card/Card.vue';
import { useFormatCurrency } from '@/composable';
import { TrendingDownIcon, TrendingUpIcon, WalletIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  stats: {
    income: number;
    expenses: number;
    balance: number;
  };
}>();

const { formatBaseCurrency } = useFormatCurrency();
</script>

<template>
  <div class="mb-6 grid grid-cols-1 gap-3 @3xl:grid-cols-3 @3xl:gap-4">
    <!-- Income Card -->
    <Card class="p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-muted-foreground text-sm font-medium">{{ t('pages.budgetDetails.stats.income') }}</p>
          <p class="text-success-text mt-1 text-2xl font-semibold tabular-nums">
            {{ formatBaseCurrency(stats.income) }}
          </p>
        </div>
        <div class="bg-success-text/10 flex size-10 items-center justify-center rounded-full">
          <TrendingUpIcon class="text-success-text size-5" />
        </div>
      </div>
    </Card>

    <!-- Expenses Card -->
    <Card class="p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-muted-foreground text-sm font-medium">{{ t('pages.budgetDetails.stats.expenses') }}</p>
          <p class="text-app-expense-color mt-1 text-2xl font-semibold tabular-nums">
            {{ formatBaseCurrency(stats.expenses) }}
          </p>
        </div>
        <div class="bg-app-expense-color/10 flex size-10 items-center justify-center rounded-full">
          <TrendingDownIcon class="text-app-expense-color size-5" />
        </div>
      </div>
    </Card>

    <!-- Net Balance Card -->
    <Card class="p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-muted-foreground text-sm font-medium">{{ t('pages.budgetDetails.stats.netBalance') }}</p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="stats.balance >= 0 ? 'text-success-text' : 'text-app-expense-color'"
          >
            {{ formatBaseCurrency(stats.balance) }}
          </p>
        </div>
        <div
          class="flex size-10 items-center justify-center rounded-full"
          :class="stats.balance >= 0 ? 'bg-success-text/10' : 'bg-app-expense-color/10'"
        >
          <WalletIcon class="size-5" :class="stats.balance >= 0 ? 'text-success-text' : 'text-app-expense-color'" />
        </div>
      </div>
    </Card>
  </div>
</template>
