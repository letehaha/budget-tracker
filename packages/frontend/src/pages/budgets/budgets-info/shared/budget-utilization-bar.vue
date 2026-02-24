<script setup lang="ts">
import Card from '@/components/lib/ui/card/Card.vue';
import { useFormatCurrency } from '@/composable';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  limitAmount: number;
  stats: {
    balance: number;
    utilizationRate: number | null;
  };
  utilizationColor: string;
  utilizationTextColor: string;
}>();

const { formatBaseCurrency } = useFormatCurrency();
</script>

<template>
  <Card class="mb-6 p-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-muted-foreground text-sm font-medium">{{ t('pages.budgetDetails.utilization.title') }}</p>
        <i18n-t keypath="pages.budgetDetails.utilization.summary" tag="p" class="text-muted-foreground mt-1 text-sm">
          <template #spent>
            <span class="font-medium text-white">{{ formatBaseCurrency(Math.max(0, -stats.balance)) }}</span>
          </template>
          <template #limit>
            <span class="font-medium text-white">{{ formatBaseCurrency(limitAmount) }}</span>
          </template>
        </i18n-t>
      </div>
      <span :class="['text-2xl font-semibold tabular-nums', utilizationTextColor]">
        {{
          stats.utilizationRate !== null
            ? `${Math.round(stats.utilizationRate)}%`
            : t('pages.budgetDetails.utilization.na')
        }}
      </span>
    </div>
    <div class="bg-muted mt-3 h-2 overflow-hidden rounded-full">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="utilizationColor"
        :style="{ width: `${Math.min(stats.utilizationRate ?? 0, 100)}%` }"
      />
    </div>
  </Card>
</template>
