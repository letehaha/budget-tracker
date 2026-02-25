<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching" class="max-h-auto">
    <template #title>
      <div class="flex items-center gap-2">
        {{ $t('dashboard.widgets.expensesStructure.title') }}

        <template v-if="hasExcludedStats">
          <Popover.Popover>
            <Popover.PopoverTrigger class="px-1" as-child>
              <Button size="icon-sm" variant="ghost">
                <CircleOffIcon class="text-warning size-4" />
              </Button>
            </Popover.PopoverTrigger>
            <Popover.PopoverContent class="max-w-75 text-sm">
              <div>
                <p>
                  {{ $t('dashboard.widgets.expensesStructure.excludedCategories.message') }}
                  <router-link to="/settings/categories" class="text-primary hover:underline" as="span">
                    {{ $t('dashboard.widgets.expensesStructure.excludedCategories.updateSettings') }}
                  </router-link>
                  {{ $t('dashboard.widgets.expensesStructure.excludedCategories.changeBehavior') }}
                </p>
                <div class="mt-3 grid gap-2">
                  <template v-for="categoryId of excludedCategories" :key="categoryId">
                    <div class="flex items-center gap-2">
                      <CategoryCircle :category="categoriesMap[categoryId]" />

                      {{ categoriesMap[categoryId]?.name }}
                    </div>
                  </template>
                </div>
              </div>
            </Popover.PopoverContent>
          </Popover.Popover>
        </template>
      </div>
    </template>

    <!-- Stats row - two columns with space between -->
    <div class="mb-4 flex items-start justify-between gap-4">
      <!-- Left: Primary value -->
      <div>
        <div class="text-2xl font-bold tracking-tight">
          <template v-if="isWidgetDataFetching && !hasData">
            <div class="bg-muted h-8 w-32 animate-pulse rounded" />
          </template>
          <template v-else>
            {{ formatBaseCurrency(animatedExpense) }}
          </template>
        </div>
        <div class="text-muted-foreground mt-1 text-xs font-medium tracking-tight uppercase">
          {{ periodLabel }}
        </div>
      </div>

      <!-- Right: Comparison -->
      <div class="flex flex-col items-end gap-1">
        <template v-if="isWidgetDataFetching && !hasData">
          <div class="bg-muted h-6 w-16 animate-pulse rounded-full" />
        </template>
        <template v-else>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="{
              'bg-destructive-text/15 text-destructive-text': expensesDiff > 0,
              'bg-success-text/15 text-success-text': expensesDiff < 0,
              'bg-muted text-muted-foreground': expensesDiff === 0,
            }"
          >
            {{ expensesDiff > 0 ? '+' : '' }}{{ expensesDiff }}%
          </span>
        </template>
        <div class="text-muted-foreground text-xs tracking-tight">
          {{ $t('dashboard.widgets.expensesStructure.vsPreviousPeriod') }}
        </div>
      </div>
    </div>

    <template v-if="isWidgetDataFetching && !hasData">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ChartPieIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <div ref="chartContainerRef" class="relative h-55 w-full">
        <svg ref="svgRef" class="h-full w-full"></svg>

        <!-- Center label: shows Total by default, category info on hover -->
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="flex flex-col items-center gap-0.5 text-center">
            <template v-if="centerLabel.isHovering">
              <div class="text-muted-foreground text-xs">{{ centerLabel.name }}</div>
              <div class="text-base font-semibold">{{ centerLabel.amount }}</div>
            </template>
            <template v-else>
              <div class="text-muted-foreground text-xs">{{ $t('common.labels.total') }}</div>
              <div class="text-base font-semibold">{{ formatBaseCurrency(totalAmount) }}</div>
            </template>
          </div>
        </div>

        <!-- Touch device overlay: shows navigation button below center label -->
        <div
          v-if="isTouch && selectedCategory"
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div class="pointer-events-auto mt-18 flex flex-col items-center">
            <Button
              size="sm"
              variant="outline"
              class="h-6 gap-1 px-2 text-xs"
              @click="navigateToTransactions({ categoryId: selectedCategoryId! })"
            >
              {{ $t('dashboard.widgets.expensesStructure.viewButton') }}
              <ExternalLinkIcon class="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { getExpensesAmountForPeriod, getSpendingsByCategories } from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useFormatCurrency } from '@/composable';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { calculatePercentageDifference } from '@/js/helpers';
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { useMediaQuery } from '@vueuse/core';
import * as d3 from 'd3';
import { differenceInDays, format, isSameMonth, subDays } from 'date-fns';
import { ChartPieIcon, CircleOffIcon, ExternalLinkIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

defineOptions({
  name: 'expenses-structure-widget',
});

interface ChartDataItem {
  categoryId: number;
  name: string;
  color: string;
  amount: number;
}

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { t } = useI18n();
const { formatBaseCurrency } = useFormatCurrency();
const categoriesStore = useCategoriesStore();
const { categoriesMap } = storeToRefs(categoriesStore);
const router = useRouter();

// DOM refs
const chartContainerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);

// Detect touch-primary devices (coarse pointer = finger/stylus)
const isTouch = useMediaQuery('(pointer: coarse)');

// Track selected category for touch devices (since there's no hover)
const selectedCategoryId = ref<number | null>(null);

// Center label state (shown on hover or when selected on touch)
const centerLabel = reactive({
  name: '',
  amount: '',
  isHovering: false,
});

const selectedCategory = computed(() => {
  if (!selectedCategoryId.value || !spendingsByCategories.value) return null;
  return spendingsByCategories.value[selectedCategoryId.value] || null;
});

// Include both from and to in query key to ensure cache invalidation when period changes
const periodQueryKey = ref(`${new Date().getTime()}-${new Date().getTime()}`);

const { data: userSettings } = useUserSettings();

const excludedCategories = computed(() =>
  userSettings.value ? userSettings.value.stats.expenses.excludedCategories : [],
);
const hasExcludedStats = computed(() => excludedCategories.value.length);

const periodLabel = computed(() => {
  const from = props.selectedPeriod.from;
  const to = props.selectedPeriod.to;
  const now = new Date();

  // Current month - show "Today"
  if (isSameMonth(now, to) && isSameMonth(from, to)) {
    return t('dashboard.widgets.expensesStructure.today');
  }

  // Specific month (not current) - show "November 2025"
  if (isSameMonth(from, to)) {
    return format(to, 'MMMM yyyy');
  }

  // Check if it's a month-aligned range
  const isFromMonthStart = from.getDate() === 1;
  const endOfToMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  const isToMonthEnd = to.getDate() === endOfToMonth.getDate();

  if (isFromMonthStart && isToMonthEnd) {
    return `${format(from, 'MMM yyyy')} - ${format(to, 'MMM yyyy')}`;
  }

  return `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;
});

watch(
  () => props.selectedPeriod,
  () => {
    periodQueryKey.value = `${props.selectedPeriod.from.getTime()}-${props.selectedPeriod.to.getTime()}`;
  },
  { deep: true },
);

const { data: spendingsByCategories, isFetching: isSpendingsByCategoriesFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureTotal, periodQueryKey],
  queryFn: () =>
    getSpendingsByCategories({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || {},
});

const { data: currentMonthExpense, isFetching: isCurrentMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructureCurrentAmount, periodQueryKey],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: props.selectedPeriod.from,
      to: props.selectedPeriod.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || 0,
});

// Calculate previous period with the same duration, ending right before current period starts
const prevPeriod = computed(() => {
  const durationInDays = differenceInDays(props.selectedPeriod.to, props.selectedPeriod.from) + 1;
  const prevTo = subDays(props.selectedPeriod.from, 1); // Day before current period starts
  const prevFrom = subDays(props.selectedPeriod.from, durationInDays);

  return { from: prevFrom, to: prevTo };
});

const { data: prevMonthExpense, isFetching: isPrevMonthExpenseFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetExpensesStructurePrevAmount, periodQueryKey],
  queryFn: () =>
    getExpensesAmountForPeriod({
      from: prevPeriod.value.from,
      to: prevPeriod.value.to,
    }),
  staleTime: Infinity,
  placeholderData: (previousData) => previousData || 0,
});

const isWidgetDataFetching = computed(
  () =>
    isSpendingsByCategoriesFetching.value || isCurrentMonthExpenseFetching.value || isPrevMonthExpenseFetching.value,
);

const { displayValue: animatedExpense } = useAnimatedNumber({
  value: computed(() => -(currentMonthExpense.value || 0)),
});

const expensesDiff = computed(() => {
  const percentage = Number(
    calculatePercentageDifference(currentMonthExpense.value || 0, prevMonthExpense.value || 0),
  ).toFixed(2);
  return Number(percentage);
});

const chartData = computed<ChartDataItem[]>(() =>
  Object.entries(spendingsByCategories.value || {}).map(([id, value]) => ({
    categoryId: Number(id),
    name: value.name,
    color: value.color,
    amount: value.amount,
  })),
);

const isDataEmpty = computed(() => chartData.value.length === 0);
const hasData = computed(() => currentMonthExpense.value !== undefined && prevMonthExpense.value !== undefined);

// Total amount for center display
const totalAmount = computed(() => chartData.value.reduce((sum, item) => sum + item.amount, 0));

// Helper function to get all category IDs including subcategories
const getAllCategoryIds = (rootCategoryId: number): number[] => {
  const result = [rootCategoryId];
  const categories = Object.values(categoriesMap.value);

  // Find all categories that have this category as parent
  const findChildren = (parentId: number) => {
    categories.forEach((cat) => {
      if (cat.parentId === parentId && !result.includes(cat.id)) {
        result.push(cat.id);
        findChildren(cat.id); // Recursively find children of children
      }
    });
  };

  findChildren(rootCategoryId);
  return result;
};

// Navigate to transactions page with category filter
const navigateToTransactions = ({ categoryId }: { categoryId: number }) => {
  const allCategoryIds = getAllCategoryIds(categoryId);

  router.push({
    name: ROUTES_NAMES.transactions,
    query: {
      categoryIds: allCategoryIds.map(String),
      start: props.selectedPeriod.from.toISOString(),
      end: props.selectedPeriod.to.toISOString(),
      transactionType: TRANSACTION_TYPES.expense,
    },
  });
};

// Clear selection when period changes
watch(
  () => props.selectedPeriod,
  () => {
    selectedCategoryId.value = null;
    centerLabel.isHovering = false;
  },
);

// D3 chart rendering
const renderChart = () => {
  if (!svgRef.value || !chartContainerRef.value || chartData.value.length === 0) return;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const width = chartContainerRef.value.clientWidth;
  const height = chartContainerRef.value.clientHeight;

  // Reserve space for the outer glow
  const glowSize = 10;
  const radius = Math.min(width, height) / 2 - glowSize;
  const innerRadius = radius * 0.7; // 70% inner radius for donut

  // Create the pie layout
  const pie = d3
    .pie<ChartDataItem>()
    .value((d) => d.amount)
    .sort(null); // Maintain original order

  // Create the arc generator
  const arc = d3.arc<d3.PieArcDatum<ChartDataItem>>().innerRadius(innerRadius).outerRadius(radius);

  // Create outer glow arc (larger outer radius for hover effect)
  const glowArc = d3
    .arc<d3.PieArcDatum<ChartDataItem>>()
    .innerRadius(radius) // Start from where main arc ends
    .outerRadius(radius + glowSize);

  // Center the chart
  const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

  // Group for glow effects (rendered behind main arcs)
  const glowGroup = g.append('g').attr('class', 'glow-group');

  // Create pie segments
  const pieData = pie(chartData.value);

  const arcs = g.selectAll('.arc').data(pieData).enter().append('g').attr('class', 'arc');

  // Draw the segments
  arcs
    .append('path')
    .attr('d', arc)
    .attr('fill', (d) => d.data.color)
    .attr('stroke', 'var(--card)')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .style('transition', 'opacity 0.2s ease')
    .on('mouseenter', function (_event, d) {
      if (isTouch.value) return;

      // Fade all other segments
      g.selectAll('.arc path').style('opacity', 0.3);
      // Highlight this segment
      d3.select(this).style('opacity', 1);

      // Add outer glow
      glowGroup.selectAll('*').remove();
      glowGroup.append('path').attr('d', glowArc(d)).attr('fill', d.data.color).style('opacity', 0.5);

      // Show category in center label
      centerLabel.name = d.data.name;
      centerLabel.amount = formatBaseCurrency(d.data.amount);
      centerLabel.isHovering = true;
    })
    .on('mouseleave', function () {
      if (isTouch.value) return;

      // Restore all segments
      g.selectAll('.arc path').style('opacity', 1);

      // Remove glow
      glowGroup.selectAll('*').remove();

      // Reset to show total
      centerLabel.isHovering = false;
    })
    .on('click', function (_event, d) {
      if (isTouch.value) {
        // On touch devices, select the category to show details + button
        selectedCategoryId.value = d.data.categoryId;

        // Fade all segments except selected
        g.selectAll('.arc path').style('opacity', 0.3);
        d3.select(this).style('opacity', 1);

        // Add outer glow
        glowGroup.selectAll('*').remove();
        glowGroup.append('path').attr('d', glowArc(d)).attr('fill', d.data.color).style('opacity', 0.5);

        // Show category in center label
        centerLabel.name = d.data.name;
        centerLabel.amount = formatBaseCurrency(d.data.amount);
        centerLabel.isHovering = true;
      } else {
        // On non-touch devices, navigate directly
        navigateToTransactions({ categoryId: d.data.categoryId });
      }
    });
};

// Watch for touch selection changes to update opacity
watch(selectedCategoryId, (newId) => {
  if (!svgRef.value || !newId) {
    // Reset all opacities and remove glow when deselected
    const svg = d3.select(svgRef.value);
    svg.selectAll('.arc path').style('opacity', 1);
    svg.selectAll('.glow-group *').remove();
    if (!newId) {
      centerLabel.isHovering = false;
    }
  }
});

// ResizeObserver for responsive chart
let resizeObserver: ResizeObserver | null = null;

const setupResizeObserver = () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (chartContainerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      renderChart();
    });
    resizeObserver.observe(chartContainerRef.value);
  }
};

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

// Re-render when data or container changes
watch(
  [chartData, chartContainerRef],
  async ([newData, container]) => {
    if (newData.length > 0 && container) {
      // Use nextTick to ensure DOM is ready
      await nextTick();
      setupResizeObserver();
      renderChart();
    }
  },
  { immediate: true, deep: true },
);
</script>
