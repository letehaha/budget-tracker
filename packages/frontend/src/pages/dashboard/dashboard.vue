<template>
  <section class="p-6">
    <div class="mb-6 flex items-center justify-center gap-1">
      <ui-button size="icon" variant="ghost" @click="selectPrevPeriod">
        <ChevronLeft :size="20" />
      </ui-button>

      <div class="w-[150px] text-center">
        {{ periodSelectorText }}
      </div>

      <ui-button size="icon" variant="ghost" :disabled="isCurrentPeriodSameMonth" @click="selectNextPeriod">
        <ChevronRight :size="20" />
      </ui-button>
    </div>

    <div
      :class="[
        `grid gap-6`,
        `xl:grid-cols-[minmax(0,1fr)_420px] xl:[grid-template-areas:'balance-trend_latest-records'_'spending-categories_latest-records']`,
        `md:grid-cols-2 md:[grid-template-areas:'balance-trend_balance-trend'_'spending-categories_latest-records']`,
        `grid-cols-1 [grid-template-areas:'balance-trend'_'spending-categories'_'latest-records']`,
      ]"
    >
      <BalanceTrendWidget :selected-period="currentPeriod" class="[grid-area:balance-trend]" />

      <SpendingCategoriesWidget :selected-period="currentPeriod" class="[grid-area:spending-categories]" />

      <LatestRecordsWidget class="[grid-area:latest-records] lg:max-w-[420px]" />
    </div>
  </section>
</template>

<script lang="ts" setup>
import UiButton from '@/components/lib/ui/button/Button.vue';
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed, defineAsyncComponent, ref } from 'vue';

const BalanceTrendWidget = defineAsyncComponent(() => import('@/components/widgets/balance-trend.vue'));
const LatestRecordsWidget = defineAsyncComponent(() => import('@/components/widgets/latest-records.vue'));
const SpendingCategoriesWidget = defineAsyncComponent(() => import('@/components/widgets/expenses-structure.vue'));

defineOptions({
  name: 'page-dashboard',
});

const currentDayInMonth = new Date().getDate();

const currentPeriod = ref({
  from: subDays(new Date(), currentDayInMonth - 1),
  to: new Date(),
});

const isCurrentPeriodSameMonth = computed(() => isSameMonth(new Date(), currentPeriod.value.to));
const periodSelectorText = computed(() => {
  if (isCurrentPeriodSameMonth.value) return 'Current Month';

  const from = format(currentPeriod.value.from, 'dd MMM');
  const to = format(currentPeriod.value.to, 'dd MMM');

  return `${from} - ${to}`;
});

const selectPrevPeriod = () => {
  const from = startOfMonth(subMonths(currentPeriod.value.from, 1));
  const to = endOfMonth(subMonths(currentPeriod.value.to, 1));
  currentPeriod.value = { from, to };
};
const selectNextPeriod = () => {
  const from = startOfMonth(addMonths(currentPeriod.value.from, 1));
  let to = endOfMonth(addMonths(currentPeriod.value.to, 1));

  if (isSameMonth(new Date(), to)) to = new Date();

  currentPeriod.value = { from, to };
};
</script>
