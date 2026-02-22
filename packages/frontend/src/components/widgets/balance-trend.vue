<template>
  <WidgetWrapper :is-fetching="isWidgetDataFetching" class="min-h-80">
    <template #title>
      <div class="flex w-full items-center gap-4">
        <span>{{ $t('dashboard.widgets.balanceTrend.title') }}</span>
        <SelectField
          v-model="selectedBalanceType"
          :values="balanceTypeOptions"
          value-key="value"
          label-key="label"
          class="w-35 text-xs"
          :disabled="isWidgetDataFetching"
        />
      </div>
    </template>
    <template v-if="isInitialLoading">
      <LoadingState />
    </template>
    <template v-else-if="isDataEmpty">
      <EmptyState>
        <ChartLineIcon class="size-32" />
      </EmptyState>
    </template>
    <template v-else>
      <!-- Stats row - two columns with space between -->
      <div class="mb-4 flex items-start justify-between gap-4">
        <!-- Left: Primary value -->
        <div>
          <div class="text-2xl font-bold tracking-tight">
            {{ formatBaseCurrency(animatedBalance) }}
          </div>
          <div class="text-muted-foreground mt-1 text-xs font-medium tracking-tight uppercase">
            {{ periodLabel }}
          </div>
        </div>

        <!-- Right: Comparison -->
        <div class="flex flex-col items-end gap-1">
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="{
              'bg-app-expense-color/15 text-app-expense-color': balancesDiff < 0,
              'bg-success-text/15 text-success-text': balancesDiff > 0,
              'bg-muted text-muted-foreground': balancesDiff === 0,
            }"
          >
            {{ balancesDiff > 0 ? '+' : '' }}{{ balancesDiff }}%
          </span>
          <div class="text-muted-foreground text-xs tracking-tight">
            {{ $t('dashboard.widgets.balanceTrend.vsPreviousPeriod') }}
          </div>
        </div>
      </div>

      <Transition name="chart-fade" mode="out-in">
        <div :key="chartKey" ref="containerRef" class="relative min-h-44 w-full flex-1">
          <svg ref="svgRef" class="h-full w-full"></svg>

          <!-- Tooltip -->
          <div
            v-show="tooltip.visible"
            ref="tooltipRef"
            class="bg-card-tooltip text-card-tooltip-foreground pointer-events-none fixed z-50 min-w-37.5 rounded-lg border px-3 py-2 text-sm shadow-lg"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          >
            <div class="mb-1 font-medium">{{ tooltip.date }}</div>
            <div>
              {{ $t('dashboard.widgets.balanceTrend.tooltip.accounts') }}
              {{ formatLargeNumber(tooltip.accountsBalance, { isFiat: true, currency: baseCurrency?.currency?.code }) }}
            </div>
            <div>
              {{ $t('dashboard.widgets.balanceTrend.tooltip.portfolios') }}
              {{
                formatLargeNumber(tooltip.portfoliosBalance, { isFiat: true, currency: baseCurrency?.currency?.code })
              }}
            </div>
            <div class="font-medium">
              {{ $t('dashboard.widgets.balanceTrend.tooltip.total') }}
              {{ formatLargeNumber(tooltip.totalBalance, { isFiat: true, currency: baseCurrency?.currency?.code }) }}
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </WidgetWrapper>
</template>

<script lang="ts" setup>
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import SelectField from '@/components/fields/select-field.vue';
import { useFormatCurrency } from '@/composable';
import { useChartTooltipPosition } from '@/composable/charts/use-chart-tooltip-position';
import { useAnimatedNumber } from '@/composable/use-animated-number';
import { calculatePercentageDifference, formatLargeNumber } from '@/js/helpers';
import { loadCombinedBalanceTrendData } from '@/services';
import { useCurrenciesStore } from '@/stores';
import { useQuery } from '@tanstack/vue-query';
import * as d3 from 'd3';
import { differenceInDays, format, isSameMonth, min, startOfDay, subDays } from 'date-fns';
import { ChartLineIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EmptyState from './components/empty-state.vue';
import LoadingState from './components/loading-state.vue';
import WidgetWrapper from './components/widget-wrapper.vue';

// Calculate it manually so chart will always have first and last ticks (dates)
function generateDateSteps({
  datesToShow = 5,
  fromDate,
  toDate,
}: {
  datesToShow?: number;
  fromDate: Date;
  toDate: Date;
}) {
  const start = startOfDay(fromDate).getTime();
  const end = startOfDay(toDate).getTime();
  const duration = end - start;
  const dates = [start];

  for (let i = 1; i < datesToShow - 1; i++) {
    const nextDate = start + (duration * i) / (datesToShow - 1);
    dates.push(Math.floor(nextDate));
  }

  dates.push(end);

  return dates;
}

defineOptions({
  name: 'balance-trend-widget',
});

const props = defineProps<{
  selectedPeriod: { from: Date; to: Date };
}>();

const { t } = useI18n();

const balanceTypeOptions = computed(() => [
  { value: 'total' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.total') },
  { value: 'accounts' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.accounts') },
  { value: 'portfolios' as const, label: t('dashboard.widgets.balanceTrend.balanceTypes.portfolios') },
]);
const selectedBalanceType = ref(balanceTypeOptions.value[0]);
const { formatBaseCurrency, getCurrencySymbol } = useFormatCurrency();
const { baseCurrency } = storeToRefs(useCurrenciesStore());

// D3 chart refs
const containerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  date: '',
  accountsBalance: 0,
  portfoliosBalance: 0,
  totalBalance: 0,
});

const { updateTooltipPosition } = useChartTooltipPosition({
  containerRef,
  tooltipRef,
  tooltip,
  strategy: 'fixed',
});

// We store actual and prev period separately, so when new data is loading, we
// can still show the old period, to avoid UI flickering
const actualDataPeriod = ref(props.selectedPeriod);
const prevDataPeriod = ref(props.selectedPeriod);
// Include both from and to in query key to ensure cache invalidation when period changes
const periodQueryKey = computed(() => `${props.selectedPeriod.from.getTime()}-${props.selectedPeriod.to.getTime()}`);

// For data fetching, cap the 'to' date at today - we can't have balance history
// for future dates. The chart x-axis will still show the full period range.
const fetchPeriod = computed(() => ({
  from: props.selectedPeriod.from,
  to: min([props.selectedPeriod.to, new Date()]),
}));

const { data: balanceHistory, isFetching: isBalanceHistoryFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend, periodQueryKey],
  queryFn: () => loadCombinedBalanceTrendData(fetchPeriod.value),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});

// Fetch the previous period's balance to compare against
// The previous period has the same duration and ends right before the current period starts
const prevPeriod = computed(() => {
  const durationInDays = differenceInDays(props.selectedPeriod.to, props.selectedPeriod.from) + 1;
  const prevTo = subDays(props.selectedPeriod.from, 1); // Day before current period starts
  const prevFrom = subDays(props.selectedPeriod.from, durationInDays);

  return {
    from: prevFrom,
    to: min([prevTo, new Date()]),
  };
});

const { data: prevPeriodBalance, isFetching: isPrevPeriodBalanceFetching } = useQuery({
  queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev, periodQueryKey],
  queryFn: () => loadCombinedBalanceTrendData(prevPeriod.value),
  staleTime: Infinity,
  placeholderData: (prevData) => prevData,
});

const isWidgetDataFetching = computed(() => isBalanceHistoryFetching.value || isPrevPeriodBalanceFetching.value);
// Only show full loading state on initial load (when we have no data to display)
const isInitialLoading = computed(() => isWidgetDataFetching.value && !balanceHistory.value);

// On each "selectedPeriod" change we immediately set it as "actualDataPeriod"
// but if "isWidgetDataFetching" is also triggered, means we started loading new
// data, then we need to actually reassing "actualDataPeriod" to be as "prevDataPeriod",
// so there won't be any data flickering. Once data is fully loaded, we assign
// actual values to both of them
watch(
  () => props.selectedPeriod,
  (value) => {
    actualDataPeriod.value = value;
  },
);
watch(
  isWidgetDataFetching,
  (value) => {
    if (value) {
      actualDataPeriod.value = prevDataPeriod.value;
    } else {
      actualDataPeriod.value = props.selectedPeriod;
      prevDataPeriod.value = props.selectedPeriod;
    }
  },
  { immediate: true },
);

const isDataEmpty = computed(() => !balanceHistory.value || balanceHistory.value.every((i) => i.totalBalance === 0));

// Key for the chart component - changes when period changes to trigger CSS transition
const chartKey = computed(() => `${actualDataPeriod.value.from.getTime()}-${actualDataPeriod.value.to.getTime()}`);

const periodLabel = computed(() => {
  const from = props.selectedPeriod.from;
  const to = props.selectedPeriod.to;
  const now = new Date();

  // Current month - show "Today"
  if (isSameMonth(now, to) && isSameMonth(from, to)) {
    return t('dashboard.widgets.balanceTrend.today');
  }

  // Specific month (not current) - show "November 2025"
  if (isSameMonth(from, to)) {
    return format(to, 'MMMM yyyy');
  }

  // Check if it's a month-aligned range (starts on 1st day, ends on last day of month)
  const isFromMonthStart = from.getDate() === 1;
  const endOfToMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0);
  const isToMonthEnd = to.getDate() === endOfToMonth.getDate();

  if (isFromMonthStart && isToMonthEnd) {
    // Multi-month range like "Aug 2025 - Nov 2025"
    return `${format(from, 'MMM yyyy')} - ${format(to, 'MMM yyyy')}`;
  }

  // Custom date range - show "MMM d, yyyy - MMM d, yyyy"
  return `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;
});

// Chart data based on selected balance type
const chartData = computed(() => {
  if (!balanceHistory.value) return [];

  return balanceHistory.value.map((point) => {
    const value =
      selectedBalanceType.value.value === 'total'
        ? point.totalBalance
        : selectedBalanceType.value.value === 'accounts'
          ? point.accountsBalance
          : point.portfoliosBalance;

    return {
      date: startOfDay(new Date(point.date)).getTime(),
      value,
      accountsBalance: point.accountsBalance,
      portfoliosBalance: point.portfoliosBalance,
      totalBalance: point.totalBalance,
    };
  });
});

// Get colors from CSS variables
const getColors = () => {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary').trim() || 'rgb(139, 92, 246)',
    text: style.getPropertyValue('--muted-foreground').trim() || 'rgb(163, 160, 155)',
    grid: style.getPropertyValue('--border').trim() || 'rgb(42, 40, 37)',
  };
};

const formatAxisValue = (value: number): string => {
  const symbol = getCurrencySymbol();
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${symbol}${(value / 1000).toFixed(0)}k`;
  }
  return `${symbol}${value}`;
};

const renderChart = () => {
  if (!svgRef.value || !containerRef.value || chartData.value.length === 0) return;

  const colors = getColors();
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const isMobile = width < 500;

  // Increased margins: more space at bottom for x-axis, right for last label
  const margin = {
    top: 10,
    right: isMobile ? 30 : 40,
    bottom: 35,
    left: isMobile ? 40 : 48,
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Calculate x-axis ticks - limit to 6-7 max
  const pixelsPerTick = isMobile ? 80 : 120;
  const ticksAmount = Math.min(7, Math.max(2, Math.round(innerWidth / pixelsPerTick)));
  const fromDate = actualDataPeriod.value.from;
  const toDate = actualDataPeriod.value.to;
  const xAxisTicks = generateDateSteps({ datesToShow: ticksAmount, fromDate, toDate });

  // X scale
  const xScale = d3
    .scaleLinear()
    .domain([xAxisTicks[0], xAxisTicks[xAxisTicks.length - 1]])
    .range([0, innerWidth]);

  // Y scale - limit to 5 ticks
  const yValues = chartData.value.map((d) => d.value);
  const yMin = d3.min(yValues) || 0;
  const yMax = d3.max(yValues) || 0;
  const yPadding = (yMax - yMin) * 0.1 || 1000;
  const yScale = d3
    .scaleLinear()
    .domain([yMin - yPadding, yMax + yPadding])
    .nice(5)
    .range([innerHeight, 0]);

  // Calculate exactly 5 tick values
  const yDomain = yScale.domain();
  const yTickCount = 5;
  const yTickStep = (yDomain[1] - yDomain[0]) / (yTickCount - 1);
  const yTickValues = Array.from({ length: yTickCount }, (_, i) => yDomain[0] + i * yTickStep);

  // Grid lines - exactly 5 ticks
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(yTickValues)
        .tickSize(-innerWidth)
        .tickFormat(() => ''),
    )
    .call((grid) => {
      grid.select('.domain').remove();
      grid.selectAll('.tick line').attr('stroke', colors.grid).attr('stroke-opacity', 0.4);
    });

  // Create gradient for area fill
  const gradientId = `area-gradient-${chartKey.value}`;
  const defs = svg.append('defs');
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '0%')
    .attr('y2', '100%');

  gradient.append('stop').attr('offset', '0%').attr('stop-color', 'var(--primary)').attr('stop-opacity', 0.35);

  gradient.append('stop').attr('offset', '100%').attr('stop-color', 'var(--primary)').attr('stop-opacity', 0);

  // Area generator
  const area = d3
    .area<(typeof chartData.value)[0]>()
    .x((d) => xScale(d.date))
    .y0(innerHeight)
    .y1((d) => yScale(d.value))
    .curve(d3.curveMonotoneX);

  // Line generator
  const line = d3
    .line<(typeof chartData.value)[0]>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.value))
    .curve(d3.curveMonotoneX);

  // Draw area
  g.append('path').datum(chartData.value).attr('class', 'area').attr('fill', `url(#${gradientId})`).attr('d', area);

  // Draw line
  g.append('path')
    .datum(chartData.value)
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', 'var(--primary)')
    .attr('stroke-width', 2)
    .attr('d', line);

  // X axis with tick indicators
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(xAxisTicks)
        .tickSize(6)
        .tickFormat((d) => {
          const date = new Date(d as number);
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }),
    )
    .call((axis) => {
      axis.select('.domain').attr('stroke', colors.grid).attr('stroke-opacity', 0.4);
      axis.selectAll('.tick line').attr('stroke', colors.grid).attr('stroke-opacity', 0.4);
      axis.selectAll('.tick text').attr('fill', colors.text).attr('font-size', '11px').attr('dy', '1em');
    });

  // Y axis - exactly 5 ticks using same values as grid
  g.append('g')
    .attr('class', 'y-axis')
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(yTickValues)
        .tickFormat((d) => formatAxisValue(d as number)),
    )
    .call((axis) => {
      axis.select('.domain').remove();
      axis.selectAll('.tick line').remove();
      axis.selectAll('.tick text').attr('fill', colors.text).attr('font-size', '11px').attr('dx', '-0.3em');
    });

  // Invisible overlay for mouse tracking
  const bisect = d3.bisector<(typeof chartData.value)[0], number>((d) => d.date).left;

  // Hover dot (hidden by default)
  const hoverDot = g
    .append('circle')
    .attr('class', 'hover-dot')
    .attr('r', 5)
    .attr('fill', 'var(--primary)')
    .attr('stroke', 'var(--card)')
    .attr('stroke-width', 2)
    .style('opacity', 0);

  // Vertical line (hidden by default)
  const hoverLine = g
    .append('line')
    .attr('class', 'hover-line')
    .attr('stroke', 'var(--primary)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,4')
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .style('opacity', 0);

  g.append('rect')
    .attr('class', 'overlay')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .attr('cursor', 'crosshair')
    .on('mouseenter', () => {
      hoverDot.style('opacity', 1);
      hoverLine.style('opacity', 0.5);
    })
    .on('mousemove', (event: MouseEvent) => {
      const [mouseX] = d3.pointer(event);
      const x0 = xScale.invert(mouseX);
      const index = bisect(chartData.value, x0, 1);
      const d0 = chartData.value[index - 1];
      const d1 = chartData.value[index];

      if (!d0) return;

      const d = d1 && x0 - d0.date > d1.date - x0 ? d1 : d0;

      // Update hover dot position
      hoverDot.attr('cx', xScale(d.date)).attr('cy', yScale(d.value));

      // Update hover line position
      hoverLine.attr('x1', xScale(d.date)).attr('x2', xScale(d.date));

      // Update tooltip
      tooltip.date = new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      tooltip.accountsBalance = d.accountsBalance;
      tooltip.portfoliosBalance = d.portfoliosBalance;
      tooltip.totalBalance = d.totalBalance;
      tooltip.visible = true;

      updateTooltipPosition(event);
    })
    .on('mouseleave', () => {
      tooltip.visible = false;
      hoverDot.style('opacity', 0);
      hoverLine.style('opacity', 0);
    });
};

const displayBalance = computed(() => {
  if (!balanceHistory.value || balanceHistory.value.length === 0) return { current: 0, previous: 0 };

  // Get the latest balance entry from current period
  const latestEntry = balanceHistory.value[balanceHistory.value.length - 1];

  // Get the latest (ending) balance from previous period for comparison
  const prevPeriodLastEntry =
    prevPeriodBalance.value && prevPeriodBalance.value.length > 0
      ? prevPeriodBalance.value[prevPeriodBalance.value.length - 1]
      : null;

  switch (selectedBalanceType.value.value) {
    case 'accounts':
      return {
        current: latestEntry.accountsBalance || 0,
        previous: prevPeriodLastEntry?.accountsBalance || 0,
      };
    case 'portfolios':
      return {
        current: latestEntry.portfoliosBalance || 0,
        previous: prevPeriodLastEntry?.portfoliosBalance || 0,
      };
    case 'total':
    default:
      return {
        current: latestEntry.totalBalance || 0,
        previous: prevPeriodLastEntry?.totalBalance || 0,
      };
  }
});

const { displayValue: animatedBalance } = useAnimatedNumber({
  value: computed(() => displayBalance.value.current),
});

const balancesDiff = computed<number>(() => {
  if (!displayBalance.value.current || !displayBalance.value.previous) return 0;

  const percentage = Number(
    calculatePercentageDifference(displayBalance.value.current, displayBalance.value.previous),
  ).toFixed(2);
  return Number(percentage);
});

// ResizeObserver for responsive chart
let resizeObserver: ResizeObserver | null = null;

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

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

// Watch for data changes and re-render chart
// Use flush: 'post' to ensure DOM is updated before rendering
watch(
  [chartData, () => actualDataPeriod.value],
  async () => {
    await nextTick();
    setupResizeObserver();
    renderChart();
  },
  { deep: true, flush: 'post' },
);

// Also watch for when container becomes available (after loading state)
watch(
  () => containerRef.value,
  async (newVal) => {
    if (newVal) {
      await nextTick();
      setupResizeObserver();
      renderChart();
    }
  },
);
</script>

<style scoped>
.chart-fade-enter-active,
.chart-fade-leave-active {
  transition: opacity 0.2s ease;
}

.chart-fade-enter-from,
.chart-fade-leave-to {
  opacity: 0;
}
</style>
