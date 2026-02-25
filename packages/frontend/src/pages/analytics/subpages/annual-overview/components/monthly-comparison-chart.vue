<template>
  <div class="border-border bg-card rounded-lg border p-4">
    <!-- Header with title and category selector -->
    <div class="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2">
      <h3 class="text-lg font-semibold">
        {{ t('analytics.trends.monthlyComparison.title') }}
        <span class="text-muted-foreground font-normal">({{ metricLabel }})</span>
      </h3>

      <!-- Category multi-select (hidden for savings metric) -->
      <div v-if="props.metric !== 'savings'" class="w-52">
        <Combobox.Combobox
          :model-value="undefined"
          v-model:searchTerm="searchTerm"
          v-model:open="isComboboxOpen"
          :multiple="true"
          class="w-full"
        >
          <Combobox.ComboboxAnchor class="border-none p-0">
            <Combobox.ComboboxTrigger
              class="ring-offset-background focus-visible:ring-ring flex w-full justify-between rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-xs font-medium"
                >
                  {{ selectedCategoryIds.length === 0 ? categories.length : selectedCategoryIds.length }}
                </span>
                <span class="text-muted-foreground">
                  {{
                    selectedCategoryIds.length === 0
                      ? t('analytics.trends.monthlyComparison.allCategories')
                      : selectedCategoryIds.length === 1
                        ? t('analytics.trends.monthlyComparison.categorySelected', { count: 1 })
                        : t('analytics.trends.monthlyComparison.categoriesSelected', {
                            count: selectedCategoryIds.length,
                          })
                  }}
                </span>
              </div>

              <template v-if="selectedCategoryIds.length > 0">
                <Button variant="ghost" size="icon" class="size-5" @click.stop="clearSelection">
                  <XIcon class="text-muted-foreground size-3" />
                </Button>
              </template>
              <template v-else>
                <ChevronDown class="text-muted-foreground size-4" />
              </template>
            </Combobox.ComboboxTrigger>
          </Combobox.ComboboxAnchor>

          <Combobox.ComboboxList class="max-h-80 w-(--reka-combobox-trigger-width)" :avoid-collisions="false">
            <div class="relative w-full items-center p-2 pb-0">
              <Combobox.ComboboxInput
                class="h-8 w-full rounded-md border pl-8 text-sm focus-visible:ring-0"
                :placeholder="t('analytics.trends.monthlyComparison.searchCategories')"
              />
              <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-4 -translate-y-1/2" />
            </div>
            <div class="max-h-60 overflow-y-auto p-1">
              <Combobox.ComboboxEmpty class="text-muted-foreground py-2 text-center text-xs" />

              <Combobox.ComboboxGroup>
                <Combobox.ComboboxItem
                  v-for="category in displayedCategories"
                  :key="category.id"
                  :value="category"
                  class="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5"
                  @select.prevent="toggleCategory(category)"
                >
                  <div class="flex items-center gap-2">
                    <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: category.color }"></span>
                    <span class="text-sm">{{ category.name }}</span>
                  </div>
                  <CheckIcon v-if="isCategorySelected(category.id)" class="size-4" />
                </Combobox.ComboboxItem>
              </Combobox.ComboboxGroup>
            </div>
          </Combobox.ComboboxList>
        </Combobox.Combobox>
      </div>
    </div>

    <!-- Loading skeleton -->
    <ChartSkeleton v-if="isLoading" />

    <!-- Error state -->
    <div v-else-if="isError" class="flex h-80 items-center justify-center">
      <div class="text-destructive-text">{{ t('analytics.trends.loadError') }}</div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!chartData.length" class="flex h-80 items-center justify-center">
      <div class="text-center">
        <div class="text-muted-foreground">{{ t('analytics.trends.noData') }}</div>
        <div class="text-muted-foreground mt-1 text-sm">{{ t('analytics.trends.noDataHint') }}</div>
      </div>
    </div>

    <!-- Chart -->
    <template v-else>
      <div class="flex flex-col">
        <div ref="containerRef" class="relative h-80 w-full">
          <svg ref="svgRef" :class="['h-full w-full', { 'pointer-events-none': isTooltipInteracting }]"></svg>

          <!-- Tooltip -->
          <div
            v-show="tooltip.visible"
            ref="tooltipRef"
            :class="[
              'bg-card-tooltip text-card-tooltip-foreground absolute rounded-lg border px-3 py-2 text-sm shadow-lg',
              !isTouchDevice || tooltip.isAverage ? 'pointer-events-none z-10' : 'pointer-events-auto z-50',
            ]"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            @mouseenter="isTooltipInteracting = true"
            @mouseleave="handleTooltipMouseLeave"
            @touchstart.stop="isTooltipInteracting = true"
          >
            <!-- Average line tooltip -->
            <template v-if="tooltip.isAverage">
              <div class="flex items-center gap-2">
                <span class="inline-block h-0.5 w-4" style="background: rgb(234, 179, 8); border-style: dashed"></span>
                <span>{{ t('analytics.trends.monthlyComparison.average') }}:</span>
                <span class="font-medium">{{ formatBaseCurrency(tooltip.value) }}</span>
              </div>
            </template>
            <!-- Bar tooltips -->
            <template v-else>
              <div class="mb-1 font-medium">{{ tooltip.period }}</div>
              <!-- Category-specific tooltip with total -->
              <template v-if="tooltip.categoryName">
                <div class="flex items-center gap-2">
                  <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: tooltip.categoryColor }"></span>
                  <span>{{ tooltip.categoryName }}:</span>
                  <span class="font-medium">{{ formatBaseCurrency(tooltip.value) }}</span>
                </div>
                <!-- Show total for the month -->
                <div v-if="tooltip.totalValue !== undefined" class="text-muted-foreground mt-1 flex items-center gap-2">
                  <span>{{ t('analytics.trends.monthlyComparison.total') }}:</span>
                  <span class="font-medium">{{ formatBaseCurrency(tooltip.totalValue) }}</span>
                </div>
              </template>
              <!-- Total tooltip (non-stacked bars) -->
              <template v-else>
                <div class="flex items-center gap-2">
                  <span>{{ metricLabel }}:</span>
                  <span class="font-medium">{{ formatBaseCurrency(tooltip.value) }}</span>
                </div>
              </template>
              <div v-if="tooltip.momChange !== undefined" class="border-border mt-1 border-t pt-1">
                <span class="mr-2">{{ t('analytics.trends.monthlyComparison.vsLastMonth') }}:</span>
                <span :class="['font-medium', getChangeColorClass(tooltip.momChange)]">
                  {{ tooltip.momChange > 0 ? '+' : '' }}{{ tooltip.momChange }}%
                </span>
              </div>
              <!-- View transactions link (shown on touch devices) -->
              <button
                v-if="isTouchDevice && tooltip.periodStart && tooltip.periodEnd"
                type="button"
                class="text-primary mt-2 block w-full text-left text-sm font-medium underline"
                @touchstart.stop
                @touchend.stop="handleViewTransactionsClick"
                @click.stop.prevent="handleViewTransactionsClick"
              >
                {{ t('analytics.trends.monthlyComparison.viewTransactions') }} →
              </button>
            </template>
          </div>
        </div>

        <!-- Legend -->
        <div class="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
          <template v-if="hasStackedBars">
            <!-- Show category colors in legend when stacked -->
            <div v-for="cat in chartCategories" :key="cat.categoryId" class="flex items-center gap-2">
              <span class="inline-block size-3 rounded-sm" :style="{ backgroundColor: cat.color }"></span>
              <span class="text-muted-foreground">{{ cat.name }}</span>
            </div>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <span class="inline-block size-3 rounded-sm" :style="{ backgroundColor: singleBarColor }"></span>
              <span class="text-muted-foreground">{{ metricLabel }}</span>
            </div>
          </template>
          <div v-if="showAverageLine" class="flex items-center gap-2">
            <span class="inline-block h-0.5 w-4" style="background: rgb(234, 179, 8); border-style: dashed"></span>
            <span class="text-muted-foreground">{{ t('analytics.trends.monthlyComparison.average') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { getCashFlow } from '@/api';
import { QUERY_CACHE_STALE_TIME, VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { useFormatCurrency } from '@/composable';
import { useChartTooltipPosition } from '@/composable/charts/use-chart-tooltip-position';
import { useDateLocale } from '@/composable/use-date-locale';
import { ROUTES_NAMES } from '@/routes';
import { useCategoriesStore } from '@/stores';
import { type CategoryModel, TRANSACTION_TYPES, type endpointsTypes } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { useSessionStorage } from '@vueuse/core';
import * as d3 from 'd3';
import { CheckIcon, ChevronDown, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import ChartSkeleton from '../../cash-flow/components/chart-skeleton.vue';

interface PeriodWithChange {
  periodStart: string;
  periodEnd: string;
  value: number;
  momChange?: number;
  categories?: endpointsTypes.CashFlowCategoryData[];
}

const props = defineProps<{
  from: Date;
  to: Date;
  metric: 'expenses' | 'income' | 'savings';
}>();

const { t } = useI18n();
const { format, locale } = useDateLocale();
const { formatBaseCurrency, getCurrencySymbol } = useFormatCurrency();
const route = useRoute();
const router = useRouter();

const { categories } = storeToRefs(useCategoriesStore());

// Detect touch device by touch capabilities
const isTouchDevice = ref(false);
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Initialize category selection from query params if present
  if (route.query.categoryIds) {
    const categoryIds = Array.isArray(route.query.categoryIds)
      ? route.query.categoryIds.map((id) => Number(id))
      : [Number(route.query.categoryIds)];

    // Only set valid category IDs (filter out NaN)
    const validIds = categoryIds.filter((id) => !isNaN(id));
    if (validIds.length > 0) {
      selectedCategoryIds.value = validIds;
    }

    // Clear query params from URL (replace to preserve back navigation)
    router.replace({ query: {} });
  }
});

const containerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

// Category multi-select state with session persistence
const selectedCategoryIds = useSessionStorage<number[]>('trends-comparison-categories', []);
const searchTerm = ref('');
const isComboboxOpen = ref(false);
const sessionOrder = ref<number[]>([]);

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  period: '',
  value: 0,
  totalValue: undefined as number | undefined,
  momChange: undefined as number | undefined,
  categoryName: undefined as string | undefined,
  categoryColor: undefined as string | undefined,
  categoryId: undefined as number | undefined,
  isAverage: false,
  // Navigation data
  periodStart: undefined as string | undefined,
  periodEnd: undefined as string | undefined,
});

// Flag to prevent chart interactions while tooltip link is being clicked
const isTooltipInteracting = ref(false);

const { updateTooltipPosition } = useChartTooltipPosition({
  containerRef,
  tooltipRef,
  tooltip,
});

// Query params
const queryParams = computed(() => ({
  from: props.from,
  to: props.to,
  granularity: 'monthly' as const,
  categoryIds: selectedCategoryIds.value.length > 0 ? selectedCategoryIds.value : undefined,
}));

// Fetch cash flow data
const {
  data: cashFlowData,
  isLoading,
  isError,
} = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCashFlow, 'monthly-comparison', queryParams],
  queryFn: () => getCashFlow(queryParams.value),
  staleTime: QUERY_CACHE_STALE_TIME.ANALYTICS,
  gcTime: QUERY_CACHE_STALE_TIME.ANALYTICS * 2,
});

// When combobox opens, reorder to show selected categories first
watch(isComboboxOpen, (open) => {
  if (open) {
    const selectedIds = new Set(selectedCategoryIds.value);
    const selectedFirst = categories.value.filter((c) => selectedIds.has(c.id));
    const others = categories.value.filter((c) => !selectedIds.has(c.id));
    sessionOrder.value = [...selectedFirst, ...others].map((c) => c.id);
  }
});

// Category selection helpers - show selected categories at top when dropdown is open
const orderedCategories = computed(() => {
  if (isComboboxOpen.value && sessionOrder.value.length) {
    const byId = new Map(categories.value.map((c) => [c.id, c] as const));
    return sessionOrder.value.map((id) => byId.get(id)!).filter(Boolean);
  }
  return categories.value;
});

const displayedCategories = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return orderedCategories.value;
  return orderedCategories.value.filter((c) => c.name.toLowerCase().includes(term));
});

const isCategorySelected = (categoryId: number) => selectedCategoryIds.value.includes(categoryId);

const toggleCategory = (category: CategoryModel) => {
  const isSelected = isCategorySelected(category.id);
  if (isSelected) {
    selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => id !== category.id);
  } else {
    selectedCategoryIds.value = [...selectedCategoryIds.value, category.id];
  }
};

const clearSelection = () => {
  selectedCategoryIds.value = [];
};

// Check if we have stacked bars (multiple categories with data for current metric)
const hasStackedBars = computed(() => {
  return chartCategories.value.length > 1;
});

// Categories from API response for legend, filtered by metric
const chartCategories = computed(() => {
  if (!chartData.value.length) return [];
  const allCategories = chartData.value[0]!.categories || [];

  // Filter to only show categories that have non-zero amount for the current metric
  // across all periods
  return allCategories.filter((cat) => {
    // Check if this category has any amount for the current metric in any period
    for (const period of chartData.value) {
      const periodCat = period.categories?.find((c) => c.categoryId === cat.categoryId);
      if (periodCat && getCategoryAmount(periodCat) > 0) {
        return true;
      }
    }
    return false;
  });
});

// Metric label
const metricLabel = computed(() => {
  const labels = {
    expenses: t('analytics.trends.metrics.expenses'),
    income: t('analytics.trends.metrics.income'),
    savings: t('analytics.trends.metrics.savings'),
  };
  return labels[props.metric];
});

// Get value based on metric
const getMetricValue = (period: endpointsTypes.CashFlowPeriodData): number => {
  switch (props.metric) {
    case 'expenses':
      return Math.abs(period.expenses);
    case 'income':
      return period.income;
    case 'savings':
      return period.netFlow;
    default:
      return 0;
  }
};

// Get category amount based on current metric
const getCategoryAmount = (cat: endpointsTypes.CashFlowCategoryData): number => {
  switch (props.metric) {
    case 'expenses':
      return Math.abs(cat.expenseAmount);
    case 'income':
      return cat.incomeAmount;
    case 'savings':
      // For savings, we might use netFlow (income - expense) but categories don't have this
      return cat.incomeAmount - Math.abs(cat.expenseAmount);
    default:
      return 0;
  }
};

// Get the displayed value for a period (what the bar actually shows)
// For stacked bars, this is the sum of category amounts; otherwise the metric total
const getDisplayedValue = (period: endpointsTypes.CashFlowPeriodData): number => {
  // If we have categories and they're being displayed as stacked bars,
  // use the sum of category amounts to match what's visually shown
  if (period.categories && period.categories.length > 0) {
    return period.categories.reduce((sum, cat) => sum + getCategoryAmount(cat), 0);
  }
  // Otherwise use the period total
  return getMetricValue(period);
};

// Chart data with MoM changes
const chartData = computed<PeriodWithChange[]>(() => {
  if (!cashFlowData.value?.periods) return [];

  return cashFlowData.value.periods.map((period, index) => {
    // Use displayed value (sum of categories if available) for consistency with visual bars
    const currentValue = getDisplayedValue(period);
    let momChange: number | undefined;

    if (index > 0) {
      const prevPeriod = cashFlowData.value!.periods[index - 1]!;
      const prevValue = getDisplayedValue(prevPeriod);

      if (prevValue === 0) {
        momChange = currentValue > 0 ? 100 : 0;
      } else {
        momChange = Math.round(((currentValue - prevValue) / Math.abs(prevValue)) * 100);
      }
    }

    return {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      value: currentValue,
      momChange,
      categories: period.categories,
    };
  });
});

// Show average line when 3+ months of data
const showAverageLine = computed(() => {
  return chartData.value.length >= 3;
});

const averageValue = computed(() => {
  if (!showAverageLine.value) return null;
  const values = chartData.value.map((d) => d.value);
  return values.reduce((a, b) => a + b, 0) / values.length;
});

// Single bar color based on metric (used when only one category or no stacked bars)
const singleBarColor = computed(() => {
  // If we have exactly one category, use its color
  if (chartCategories.value.length === 1) {
    return chartCategories.value[0]!.color;
  }

  // Otherwise use metric-based color
  const root = document.documentElement;
  const style = getComputedStyle(root);

  switch (props.metric) {
    case 'expenses':
      return style.getPropertyValue('--destructive-text').trim() || 'rgb(239, 68, 68)';
    case 'income':
      return style.getPropertyValue('--success-text').trim() || 'rgb(46, 204, 113)';
    case 'savings':
      return 'rgb(59, 130, 246)'; // blue-500
    default:
      return 'rgb(161, 161, 170)';
  }
});

// Get change color class
const getChangeColorClass = (change: number): string => {
  if (change === 0) return 'text-muted-foreground';

  // For expenses, decrease is good (green), increase is bad (red)
  // For income/savings, increase is good (green), decrease is bad (red)
  const isPositiveGood = props.metric !== 'expenses';

  if (change > 0) {
    return isPositiveGood ? 'text-green-500' : 'text-red-500';
  } else {
    return isPositiveGood ? 'text-red-500' : 'text-green-500';
  }
};

// Colors from CSS variables
const getColors = () => {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    bar: singleBarColor.value,
    grid: style.getPropertyValue('--border').trim() || 'rgb(39, 39, 42)',
    text: style.getPropertyValue('--muted-foreground').trim() || 'rgb(161, 161, 170)',
    // Average line uses a more prominent color for better visibility
    averageLine: 'rgb(234, 179, 8)', // amber-500 - stands out against most backgrounds
    averageLabelBg: style.getPropertyValue('--card').trim() || 'rgb(24, 24, 27)',
    positive: 'rgb(34, 197, 94)', // green-500
    negative: 'rgb(239, 68, 68)', // red-500
  };
};

const getMargins = ({ width, shouldRotate }: { width: number; shouldRotate: boolean }) => {
  const isMobile = width < 400;
  return {
    top: 40, // Space for MoM badges
    right: isMobile ? 10 : 20,
    left: isMobile ? 40 : 60,
    bottom: shouldRotate ? 70 : 40,
  };
};

const formatPeriodLabel = (periodStart: string): string => {
  const date = new Date(periodStart);
  return format(date, 'MMM yy');
};

const formatAxisValue = (value: number): string => {
  const symbol = getCurrencySymbol();
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${symbol}${(value / 1000).toFixed(0)}K`;
  }
  return `${symbol}${value}`;
};

const renderChart = () => {
  if (!svgRef.value || !containerRef.value || chartData.value.length === 0) return;

  const colors = getColors();
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  // Add defs element for gradients and filters
  svg.append('defs');

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const isMobile = width < 400;

  const spacePerLabel = width / chartData.value.length;
  const shouldRotateLabels = spacePerLabel < 55 || chartData.value.length >= 12;

  const margin = getMargins({ width, shouldRotate: shouldRotateLabels });
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // X scale
  const xScale = d3
    .scaleBand()
    .domain(chartData.value.map((d) => d.periodStart))
    .range([0, innerWidth])
    .padding(0.3);

  // Determine if we're rendering stacked bars
  const isStacked = hasStackedBars.value && chartData.value.some((d) => d.categories && d.categories.length > 0);

  // Get list of category IDs to render (only those with data for current metric)
  const renderCategoryIds = new Set(chartCategories.value.map((c) => c.categoryId));

  // Y scale - calculate max value
  let yMax = 0;
  if (isStacked) {
    // For stacked bars, max is sum of all category amounts per period (filtered by metric)
    chartData.value.forEach((period) => {
      if (period.categories) {
        const sum = period.categories
          .filter((cat) => renderCategoryIds.has(cat.categoryId))
          .reduce((acc, cat) => acc + getCategoryAmount(cat), 0);
        yMax = Math.max(yMax, sum);
      }
    });
  } else {
    yMax = d3.max(chartData.value, (d) => d.value) || 0;
  }

  const minValue = props.metric === 'savings' && !isStacked ? d3.min(chartData.value, (d) => d.value) || 0 : 0;
  const yMin = Math.min(minValue, 0);

  const yScale = d3
    .scaleLinear()
    .domain([yMin, Math.max(yMax, 0)])
    .nice()
    .range([innerHeight, 0]);

  // Grid lines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => ''),
    )
    .call((grid) => {
      grid.select('.domain').remove();
      grid.selectAll('.tick line').attr('stroke', colors.grid).attr('stroke-opacity', 0.5);
    });

  // Zero line for savings metric
  if (props.metric === 'savings' && yMin < 0 && !isStacked) {
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', colors.grid)
      .attr('stroke-width', 1);
  }

  // X axis
  const labelRotation = shouldRotateLabels ? -45 : 0;
  const fontSize = isMobile ? '10px' : '12px';

  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickFormat((d) => formatPeriodLabel(d as string)))
    .call((axis) => {
      axis.select('.domain').attr('stroke', colors.grid);
      axis
        .selectAll('.tick text')
        .attr('fill', colors.text)
        .attr('font-size', fontSize)
        .attr('transform', `rotate(${labelRotation})`)
        .attr('text-anchor', shouldRotateLabels ? 'end' : 'middle')
        .attr('dx', shouldRotateLabels ? '-0.5em' : '0')
        .attr('dy', shouldRotateLabels ? '0.5em' : '0.7em');
      axis.selectAll('.tick line').attr('stroke', colors.grid);
    });

  // Y axis
  g.append('g')
    .attr('class', 'y-axis')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(isMobile ? 5 : 6)
        .tickFormat((d) => formatAxisValue(d as number)),
    )
    .call((axis) => {
      axis.select('.domain').attr('stroke', colors.grid);
      axis.selectAll('.tick text').attr('fill', colors.text).attr('font-size', fontSize);
      axis.selectAll('.tick line').attr('stroke', colors.grid);
    });

  // Average line - rendered BEFORE bars so it appears below them
  // This prevents interference with bar hover events
  if (showAverageLine.value && averageValue.value !== null) {
    const avgY = yScale(averageValue.value);

    // Shadow line for better visibility on any background
    g.append('line')
      .attr('class', 'average-line-shadow')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', avgY)
      .attr('y2', avgY)
      .attr('stroke', 'rgba(0, 0, 0, 0.5)')
      .attr('stroke-width', 5)
      .attr('stroke-dasharray', '8,4');

    // Main average line
    g.append('line')
      .attr('class', 'average-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', avgY)
      .attr('y2', avgY)
      .attr('stroke', colors.averageLine)
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '8,4');

    // Average label with background for better visibility
    const labelText = `${t('analytics.trends.monthlyComparison.average')}: ${formatBaseCurrency(averageValue.value)}`;
    const labelFontSize = 11;
    const avgValueForTooltip = averageValue.value;

    // Add text first to measure it
    const tempText = g
      .append('text')
      .attr('font-size', `${labelFontSize}px`)
      .attr('font-weight', '500')
      .text(labelText);
    const textBBox = (tempText.node() as SVGTextElement).getBBox();
    tempText.remove();

    // Create a group for the label (for hover handling)
    const labelGroup = g.append('g').attr('class', 'average-label-group').style('cursor', 'pointer');

    // Background rectangle for label
    labelGroup
      .append('rect')
      .attr('class', 'average-label-bg')
      .attr('x', innerWidth - textBBox.width - 12)
      .attr('y', avgY - textBBox.height - 4)
      .attr('width', textBBox.width + 8)
      .attr('height', textBBox.height + 4)
      .attr('fill', colors.averageLabelBg)
      .attr('rx', 3);

    // Average label text
    labelGroup
      .append('text')
      .attr('class', 'average-label')
      .attr('x', innerWidth - 8)
      .attr('y', avgY - 6)
      .attr('text-anchor', 'end')
      .attr('font-size', `${labelFontSize}px`)
      .attr('font-weight', '500')
      .attr('fill', colors.averageLine)
      .text(labelText);

    // Add hover events to the label group
    labelGroup
      .on('mouseenter', (event: MouseEvent) => handleAverageLabelMouseEnter(event, avgValueForTooltip))
      .on('mousemove', handleMouseMove)
      .on('mouseleave', handleMouseLeave);
  }

  // Bars
  const MAX_BAR_WIDTH = 60;
  const bandwidth = xScale.bandwidth();
  const barWidth = Math.min(bandwidth, MAX_BAR_WIDTH);
  const barOffset = (bandwidth - barWidth) / 2;

  const zeroY = yScale(0);

  // Helper to create a path with only top corners rounded
  const createTopRoundedRect = ({
    x,
    y,
    width: w,
    height: h,
    radius,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  }) => {
    const r = Math.min(radius, h / 2, w / 2);
    return `
      M ${x + r} ${y}
      L ${x + w - r} ${y}
      Q ${x + w} ${y} ${x + w} ${y + r}
      L ${x + w} ${y + h}
      L ${x} ${y + h}
      L ${x} ${y + r}
      Q ${x} ${y} ${x + r} ${y}
      Z
    `;
  };

  if (isStacked) {
    // Render stacked bars
    chartData.value.forEach((period) => {
      if (!period.categories) return;

      let currentY = innerHeight; // Start from bottom

      // Filter to only categories with data for current metric, then sort
      const filteredCategories = period.categories.filter((cat) => renderCategoryIds.has(cat.categoryId));
      const sortedCategories = filteredCategories.toSorted((a, b) => {
        const indexA = selectedCategoryIds.value.indexOf(a.categoryId);
        const indexB = selectedCategoryIds.value.indexOf(b.categoryId);
        return indexA - indexB;
      });

      // Find which segments actually have height (non-zero amounts)
      const visibleSegments = sortedCategories.filter((cat) => getCategoryAmount(cat) > 0);
      const topSegmentId = visibleSegments.length > 0 ? visibleSegments[visibleSegments.length - 1]!.categoryId : null;

      // Inner shadow height to help distinguish segments with similar colors
      const shadowHeight = 4;
      let segmentIndex = 0;
      let previousSegmentColor: string | null = null;

      sortedCategories.forEach((cat) => {
        const catAmount = getCategoryAmount(cat);
        if (catAmount === 0) return; // Skip categories with zero amount

        const catHeight = Math.abs(yScale(0) - yScale(catAmount));
        currentY -= catHeight;

        const isTopSegment = cat.categoryId === topSegmentId;
        const segmentX = xScale(period.periodStart)! + barOffset;

        if (isTopSegment) {
          // Use path for top segment with only top corners rounded
          g.append('path')
            .attr('class', 'bar-segment')
            .attr('data-category-id', cat.categoryId)
            .attr(
              'd',
              createTopRoundedRect({ x: segmentX, y: currentY, width: barWidth, height: catHeight, radius: 4 }),
            )
            .attr('fill', cat.color)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent) => handleStackedMouseEnter(event, period, cat))
            .on('mousemove', handleMouseMove)
            .on('mouseleave', handleStackedMouseLeave)
            .on('click', (event: MouseEvent) => handleBarClick(event, period, cat.categoryId));
        } else {
          // Regular rect for other segments (no rounding)
          g.append('rect')
            .attr('class', 'bar-segment')
            .attr('data-category-id', cat.categoryId)
            .attr('x', segmentX)
            .attr('y', currentY)
            .attr('width', barWidth)
            .attr('height', catHeight)
            .attr('fill', cat.color)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent) => handleStackedMouseEnter(event, period, cat))
            .on('mousemove', handleMouseMove)
            .on('mouseleave', handleStackedMouseLeave)
            .on('click', (event: MouseEvent) => handleBarClick(event, period, cat.categoryId));
        }

        // Add inner shadow only between segments with the same color
        // This helps distinguish same-color segments without affecting different-color boundaries
        if (segmentIndex > 0 && previousSegmentColor === cat.color) {
          // Create unique gradient ID for this segment's inner shadow
          const gradientId = `inner-shadow-${period.periodStart}-${cat.categoryId}`;

          // Define gradient for inner shadow (transparent at top, dark at bottom)
          const gradient = svg
            .select('defs')
            .append('linearGradient')
            .attr('id', gradientId)
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '100%');

          gradient.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(0, 0, 0, 0)');
          gradient.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(0, 0, 0, 0.3)');

          const actualShadowHeight = Math.min(shadowHeight, catHeight);
          g.append('rect')
            .attr('class', 'segment-shadow')
            .attr('x', segmentX)
            .attr('y', currentY + catHeight - actualShadowHeight)
            .attr('width', barWidth)
            .attr('height', actualShadowHeight)
            .attr('fill', `url(#${gradientId})`)
            .style('pointer-events', 'none');
        }

        previousSegmentColor = cat.color;
        segmentIndex++;
      });
    });
  } else {
    // Render simple bars
    g.selectAll('.bar')
      .data(chartData.value)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.periodStart)! + barOffset)
      .attr('y', (d) => (d.value >= 0 ? yScale(d.value) : zeroY))
      .attr('width', barWidth)
      .attr('height', (d) => Math.abs(yScale(d.value) - zeroY))
      .attr('fill', colors.bar)
      .attr('rx', 4)
      .attr('ry', 4)
      .style('cursor', 'pointer')
      .on('mouseenter', handleMouseEnter)
      .on('mousemove', handleMouseMove)
      .on('mouseleave', handleMouseLeave)
      .on('click', (event: MouseEvent, d) => {
        // When exactly one category has data, pass its ID for navigation
        const singleCategoryId = chartCategories.value.length === 1 ? chartCategories.value[0]!.categoryId : undefined;
        handleBarClick(event, d, singleCategoryId);
      });
  }

  // MoM change badges with background
  const isPositiveGood = props.metric !== 'expenses';
  const badgeData = chartData.value.filter((d) => d.momChange !== undefined);
  const badgeFontSize = isMobile ? 9 : 11;
  const badgePadding = { x: 4, y: 2 };

  // Helper to get badge Y position
  const getBadgeY = (d: PeriodWithChange) => {
    if (isStacked && d.categories) {
      const sum = d.categories
        .filter((cat) => renderCategoryIds.has(cat.categoryId))
        .reduce((acc, cat) => acc + getCategoryAmount(cat), 0);
      return yScale(sum) - 8;
    }
    const barY = d.value >= 0 ? yScale(d.value) : zeroY;
    return barY - 8;
  };

  // Helper to get badge color
  const getBadgeColor = (d: PeriodWithChange) => {
    if (d.momChange === 0) return colors.text;
    if (d.momChange! > 0) {
      return isPositiveGood ? colors.positive : colors.negative;
    }
    return isPositiveGood ? colors.negative : colors.positive;
  };

  // Create groups for each badge (background + text)
  const badgeGroups = g
    .selectAll('.mom-badge-group')
    .data(badgeData)
    .enter()
    .append('g')
    .attr('class', 'mom-badge-group');

  // Add text first to measure it
  const badgeTexts = badgeGroups
    .append('text')
    .attr('class', 'mom-badge')
    .attr('x', (d) => xScale(d.periodStart)! + bandwidth / 2)
    .attr('y', (d) => getBadgeY(d))
    .attr('text-anchor', 'middle')
    .attr('font-size', `${badgeFontSize}px`)
    .attr('font-weight', '600')
    .attr('fill', (d) => getBadgeColor(d))
    .text((d) => `${d.momChange! > 0 ? '+' : ''}${d.momChange}%`);

  // Add background rectangles behind text
  badgeTexts.each(function () {
    const textEl = this as SVGTextElement;
    const bbox = textEl.getBBox();
    const group = d3.select(textEl.parentNode as SVGGElement);

    // Insert rect before text (so it appears behind)
    group
      .insert('rect', '.mom-badge')
      .attr('class', 'mom-badge-bg')
      .attr('x', bbox.x - badgePadding.x)
      .attr('y', bbox.y - badgePadding.y)
      .attr('width', bbox.width + badgePadding.x * 2)
      .attr('height', bbox.height + badgePadding.y * 2)
      .attr('fill', colors.averageLabelBg)
      .attr('rx', 3);
  });
};

// Get category ID and all its children IDs
function getCategoryWithChildrenIds(categoryId: number): number[] {
  const ids = [categoryId];
  // Find all categories where parentId matches the given category
  const children = categories.value.filter((cat) => cat.parentId === categoryId);
  for (const child of children) {
    // Recursively get children of children
    ids.push(...getCategoryWithChildrenIds(child.id));
  }
  return ids;
}

// Navigate to transactions page with filters
function navigateToTransactions({
  periodStart,
  periodEnd,
  categoryId,
}: {
  periodStart: string;
  periodEnd: string;
  categoryId?: number;
}) {
  const query: Record<string, string | string[]> = {
    start: periodStart,
    end: periodEnd,
  };

  // Add category filter if specified (including all child categories)
  // Vue Router handles arrays as ?categoryIds[]=1&categoryIds[]=2
  if (categoryId !== undefined) {
    const allCategoryIds = getCategoryWithChildrenIds(categoryId);
    query.categoryIds = allCategoryIds.map(String);
  }

  // Add transaction type filter based on metric
  if (props.metric === 'expenses') {
    query.transactionType = TRANSACTION_TYPES.expense;
  } else if (props.metric === 'income') {
    query.transactionType = TRANSACTION_TYPES.income;
  }
  // For savings, don't filter by type (shows all)

  router.push({
    name: ROUTES_NAMES.transactions,
    query,
  });
}

function handleMouseEnter(event: MouseEvent, d: PeriodWithChange) {
  // Skip if user is interacting with tooltip
  if (isTooltipInteracting.value) return;

  const startDate = new Date(d.periodStart);
  tooltip.period = format(startDate, 'MMMM yyyy');
  tooltip.value = d.value;
  tooltip.totalValue = undefined; // No total needed for non-stacked bars
  tooltip.momChange = d.momChange;
  tooltip.categoryName = undefined;
  tooltip.categoryColor = undefined;
  tooltip.categoryId = undefined;
  tooltip.isAverage = false;
  // Store navigation data
  tooltip.periodStart = d.periodStart;
  tooltip.periodEnd = d.periodEnd;
  tooltip.visible = true;
  updateTooltipPosition(event);
}

function handleStackedMouseEnter(
  event: MouseEvent,
  period: PeriodWithChange,
  cat: endpointsTypes.CashFlowCategoryData,
) {
  // Skip if user is interacting with tooltip
  if (isTooltipInteracting.value) return;

  const startDate = new Date(period.periodStart);
  tooltip.period = format(startDate, 'MMMM yyyy');
  tooltip.value = getCategoryAmount(cat);

  // Calculate total for the period (sum of all categories for current metric)
  const total =
    period.categories
      ?.filter((c) => chartCategories.value.some((cc) => cc.categoryId === c.categoryId))
      .reduce((acc, c) => acc + getCategoryAmount(c), 0) ?? 0;
  tooltip.totalValue = total;

  tooltip.momChange = period.momChange;
  tooltip.categoryName = cat.name;
  tooltip.categoryColor = cat.color;
  tooltip.categoryId = cat.categoryId;
  tooltip.isAverage = false;
  // Store navigation data
  tooltip.periodStart = period.periodStart;
  tooltip.periodEnd = period.periodEnd;
  tooltip.visible = true;
  updateTooltipPosition(event);

  // Reduce opacity of other segments to highlight hovered category
  if (svgRef.value) {
    const svg = d3.select(svgRef.value);
    svg
      .selectAll('.bar-segment')
      .transition()
      .duration(150)
      .style('opacity', function () {
        const segmentCategoryId = d3.select(this).attr('data-category-id');
        return segmentCategoryId === String(cat.categoryId) ? 1 : 0.3;
      });
  }
}

function handleStackedMouseLeave() {
  tooltip.visible = false;

  // Restore opacity of all segments
  if (svgRef.value) {
    const svg = d3.select(svgRef.value);
    svg.selectAll('.bar-segment').transition().duration(150).style('opacity', 1);
  }
}

// Handle bar click - navigate on desktop, show tooltip on touch
function handleBarClick(_event: MouseEvent, d: PeriodWithChange, categoryId?: number) {
  // Skip if user is interacting with tooltip
  if (isTooltipInteracting.value) return;

  if (!isTouchDevice.value) {
    // Desktop: navigate directly
    navigateToTransactions({
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      categoryId,
    });
  }
  // Touch device: tooltip is already shown by mouseenter/touchstart
}

// Handle "View transactions" click from tooltip (touch devices)
function handleViewTransactionsClick() {
  if (tooltip.periodStart && tooltip.periodEnd) {
    navigateToTransactions({
      periodStart: tooltip.periodStart,
      periodEnd: tooltip.periodEnd,
      categoryId: tooltip.categoryId,
    });
  }
}

function handleAverageLabelMouseEnter(event: MouseEvent, avgValue: number) {
  tooltip.value = avgValue;
  tooltip.isAverage = true;
  tooltip.visible = true;
  updateTooltipPosition(event);
}

function handleMouseMove(event: MouseEvent) {
  updateTooltipPosition(event);
}

function handleMouseLeave() {
  tooltip.visible = false;
}

function handleTooltipMouseLeave() {
  isTooltipInteracting.value = false;
}

// ResizeObserver for responsive chart
let resizeObserver: ResizeObserver | null = null;

// Setup resize observer when container becomes available
const setupResizeObserver = () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      renderChart();
    });
    resizeObserver.observe(containerRef.value);
  }
};

onMounted(() => {
  renderChart();
  setupResizeObserver();
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

// Watch containerRef to set up observer when it becomes available
// (container is inside v-else block that appears after data loads)
watch(containerRef, (newVal) => {
  if (newVal) {
    setupResizeObserver();
  }
});

watch(
  [chartData, () => props.metric, locale, selectedCategoryIds],
  () => {
    // Use nextTick to ensure DOM is updated before rendering
    // (SVG container is in v-else block that appears when data loads)
    nextTick(renderChart);
  },
  { deep: true },
);
</script>
