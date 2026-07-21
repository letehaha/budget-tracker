<template>
  <div ref="containerRef" class="relative h-80 w-full">
    <svg ref="svgRef" class="h-full w-full" />

    <div
      v-show="tooltip.visible"
      ref="tooltipRef"
      class="bg-card-tooltip text-card-tooltip-foreground pointer-events-none absolute z-10 min-w-[18rem] rounded-xl border px-4 py-3 text-sm shadow-xl"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <div class="text-muted-foreground mb-2.5 text-xs font-medium tracking-wide uppercase">
        {{ tooltip.periodLabel }}
      </div>

      <div class="mb-3">
        <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.chart.totalGained') }}</div>
        <div class="text-xl font-semibold tabular-nums">
          {{ formatBaseCurrency(tooltip.savedCumulative + tooltip.grownCumulative) }}
        </div>
      </div>

      <div v-if="tooltip.hasSplit" class="bg-muted mb-2.5 flex h-2 overflow-hidden rounded-full">
        <div class="h-full" :style="{ width: `${tooltip.savedPct}%`, backgroundColor: seriesColors.saved }" />
        <div class="h-full" :style="{ width: `${100 - tooltip.savedPct}%`, backgroundColor: seriesColors.grown }" />
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-4">
          <span class="flex items-center gap-2">
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: seriesColors.saved }" />
            <span class="text-muted-foreground">{{ $t('netWorthDrivers.chart.saved') }}</span>
            <span v-if="tooltip.hasSplit" class="text-muted-foreground/70 text-xs tabular-nums"
              >{{ tooltip.savedPct }}%</span
            >
          </span>
          <span class="font-medium tabular-nums">{{ formatBaseCurrency(tooltip.savedCumulative) }}</span>
        </div>

        <div class="flex items-center justify-between gap-4">
          <span class="flex items-center gap-2">
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: seriesColors.grown }" />
            <span class="text-muted-foreground">{{ $t('netWorthDrivers.chart.grown') }}</span>
            <span v-if="tooltip.hasSplit" class="text-muted-foreground/70 text-xs tabular-nums"
              >{{ 100 - tooltip.savedPct }}%</span
            >
          </span>
          <span class="font-medium tabular-nums">{{ formatBaseCurrency(tooltip.grownCumulative) }}</span>
        </div>
      </div>

      <div class="border-border mt-3 border-t pt-2.5">
        <div class="text-muted-foreground mb-1.5 text-xs">{{ $t('netWorthDrivers.chart.thisPeriod') }}</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.chart.periodSavings') }}</div>
            <div class="font-medium tabular-nums" :class="{ 'text-app-expense-color': tooltip.savingsNet < 0 }">
              {{ formatBaseCurrency(tooltip.savingsNet) }}
            </div>
          </div>
          <div>
            <div class="text-muted-foreground text-xs">{{ $t('netWorthDrivers.chart.periodGrowth') }}</div>
            <div class="font-medium tabular-nums" :class="{ 'text-app-expense-color': tooltip.growth < 0 }">
              {{ formatBaseCurrency(tooltip.growth) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getChartColors } from '@/composable/charts/chart-colors';
import { formatAxisCurrency } from '@/composable/charts/format-axis-currency';
import { useChartTooltipPosition } from '@/composable/charts/use-chart-tooltip-position';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { currentTheme } from '@/common/utils/color-theme';
import { endpointsTypes } from '@bt/shared/types';
import { useResizeObserver } from '@vueuse/core';
import * as d3 from 'd3';
import { parseISO } from 'date-fns';
import { reactive, ref, watch } from 'vue';

import type { CumulativePoint } from '../composables/net-worth-drivers-derivations';
import { useSeriesColors } from '../composables/use-series-colors';

const props = defineProps<{
  points: CumulativePoint[];
  granularity: endpointsTypes.NetWorthDriversGranularity;
}>();

const { format: formatDate } = useDateLocale();
const { formatBaseCurrency, getCurrencySymbol } = useFormatCurrency();

const containerRef = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  periodLabel: '',
  savedCumulative: 0,
  grownCumulative: 0,
  savingsNet: 0,
  growth: 0,
  hasSplit: false,
  savedPct: 0,
});

const { updateTooltipPosition } = useChartTooltipPosition({ containerRef, tooltipRef, tooltip });

const seriesColors = useSeriesColors();

const AREA_FILL_OPACITY = 0.22;

const MOBILE_BREAKPOINT_PX = 400;

const getColors = () => {
  const { grid, text } = getChartColors();
  return { grid, text, saved: seriesColors.value.saved, grown: seriesColors.value.grown };
};

const getMargins = ({ width }: { width: number }) => {
  const isMobile = width < MOBILE_BREAKPOINT_PX;
  return { top: 12, right: isMobile ? 12 : 20, bottom: 28, left: isMobile ? 44 : 60 };
};

const formatAxisValue = (value: number) =>
  formatAxisCurrency({ value: Math.round(value), symbol: getCurrencySymbol() });

const bucketLabel = ({ periodStart }: { periodStart: string }) => {
  const date = parseISO(periodStart);
  if (props.granularity === 'yearly') return formatDate(date, 'yyyy');
  if (props.granularity === 'quarterly') return formatDate(date, 'QQQ yyyy');
  return formatDate(date, 'MMM yyyy');
};

const renderChart = () => {
  if (!svgRef.value || !containerRef.value) return;

  const colors = getColors();
  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();

  if (props.points.length === 0) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const isMobile = width < MOBILE_BREAKPOINT_PX;
  const fontSize = isMobile ? '10px' : '12px';
  const margin = getMargins({ width });
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xScale = d3
    .scaleLinear()
    .domain([0, Math.max(props.points.length - 1, 1)])
    .range([0, innerWidth]);

  // Both series are drawn from zero, and either can go negative, so the domain
  // must always contain zero and both extremes — otherwise a fully-negative
  // window would put the zero anchor outside the plot and the areas would
  // render inverted.
  const allValues = props.points.flatMap((point) => [point.savedCumulative, point.grownCumulative]);
  const yScale = d3
    .scaleLinear()
    .domain([Math.min(0, d3.min(allValues) ?? 0), Math.max(0, d3.max(allValues) ?? 0)])
    .nice()
    .range([innerHeight, 0]);

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

  // Always drawn: it is the baseline both areas are anchored to, and the line a
  // drawdown crosses.
  g.append('line')
    .attr('class', 'zero-line')
    .attr('x1', 0)
    .attr('x2', innerWidth)
    .attr('y1', yScale(0))
    .attr('y2', yScale(0))
    .attr('stroke', colors.grid)
    .attr('stroke-width', 1);

  const seriesList = [
    { key: 'saved' as const, color: colors.saved, accessor: (point: CumulativePoint) => point.savedCumulative },
    { key: 'grown' as const, color: colors.grown, accessor: (point: CumulativePoint) => point.grownCumulative },
  ];

  // Layered, not stacked: each series is its own area anchored at zero, so the
  // reader compares heights against the axis and a negative series simply drops
  // below it. Saved is painted first so growth reads on top of it.
  for (const series of seriesList) {
    const area = d3
      .area<CumulativePoint>()
      .x((_, index) => xScale(index))
      .y0(yScale(0))
      .y1((point) => yScale(series.accessor(point)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(props.points)
      .attr('fill', series.color)
      .attr('fill-opacity', AREA_FILL_OPACITY)
      .attr('pointer-events', 'none')
      .attr('d', area);

    const line = d3
      .line<CumulativePoint>()
      .x((_, index) => xScale(index))
      .y((point) => yScale(series.accessor(point)))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(props.points)
      .attr('fill', 'none')
      .attr('stroke', series.color)
      .attr('stroke-width', 2)
      .attr('pointer-events', 'none')
      .attr('d', line);
  }

  const tickCount = Math.min(props.points.length, isMobile ? 4 : 8);
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(tickCount)
        .tickFormat((value) => {
          const point = props.points[Math.round(value as number)];
          return point ? bucketLabel({ periodStart: point.periodStart }) : '';
        }),
    )
    .call((axis) => {
      axis.select('.domain').attr('stroke', colors.grid);
      axis.selectAll('.tick text').attr('fill', colors.text).attr('font-size', fontSize);
      axis.selectAll('.tick line').attr('stroke', colors.grid);
    });

  g.append('g')
    .call(
      d3
        .axisLeft(yScale)
        .ticks(isMobile ? 5 : 6)
        .tickFormat((value) => formatAxisValue(value as number)),
    )
    .call((axis) => {
      axis.select('.domain').attr('stroke', colors.grid);
      axis.selectAll('.tick text').attr('fill', colors.text).attr('font-size', fontSize);
      axis.selectAll('.tick line').attr('stroke', colors.grid);
    });

  const hoverLine = g
    .append('line')
    .attr('stroke', colors.text)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,4')
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .style('opacity', 0);

  const hoverDots = seriesList.map((series) =>
    g
      .append('circle')
      .attr('r', 4)
      .attr('fill', series.color)
      .attr('stroke', 'var(--card)')
      .attr('stroke-width', 2)
      .style('opacity', 0),
  );

  // One overlay owns every pointer event: the areas overlap, so whichever was
  // appended last would otherwise swallow the other's hovers.
  g.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .attr('cursor', 'crosshair')
    .on('mouseenter', () => {
      hoverLine.style('opacity', 0.5);
      hoverDots.forEach((dot) => dot.style('opacity', 1));
    })
    .on('mousemove', (event: MouseEvent) => {
      const [mouseX] = d3.pointer(event);
      const index = Math.max(0, Math.min(props.points.length - 1, Math.round(xScale.invert(mouseX))));
      const point = props.points[index];
      if (!point) return;

      hoverLine.attr('x1', xScale(index)).attr('x2', xScale(index));
      hoverDots[0]!.attr('cx', xScale(index)).attr('cy', yScale(point.savedCumulative));
      hoverDots[1]!.attr('cx', xScale(index)).attr('cy', yScale(point.grownCumulative));

      tooltip.periodLabel = bucketLabel({ periodStart: point.periodStart });
      tooltip.savedCumulative = point.savedCumulative;
      tooltip.grownCumulative = point.grownCumulative;
      tooltip.savingsNet = point.savingsNet;
      tooltip.growth = point.growth;

      // A share of a total that either side is dragging negative isn't a
      // proportion, so the split bar is dropped rather than shown as nonsense.
      const total = point.savedCumulative + point.grownCumulative;
      tooltip.hasSplit = point.savedCumulative >= 0 && point.grownCumulative >= 0 && total > 0;
      tooltip.savedPct = tooltip.hasSplit ? Math.round((point.savedCumulative / total) * 100) : 0;

      tooltip.visible = true;
      updateTooltipPosition(event);
    })
    .on('mouseleave', () => {
      tooltip.visible = false;
      hoverLine.style('opacity', 0);
      hoverDots.forEach((dot) => dot.style('opacity', 0));
    });
};

useResizeObserver(containerRef, renderChart);

// `flush: 'post'` so the container has been laid out with the new data before
// the render reads its dimensions — the stat cards above can change height.
watch([() => props.points, () => props.granularity, currentTheme], renderChart, { deep: true, flush: 'post' });
</script>
