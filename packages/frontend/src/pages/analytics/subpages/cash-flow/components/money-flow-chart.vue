<template>
  <div ref="containerRef" class="relative w-full">
    <svg ref="svgRef" class="block w-full"></svg>

    <div
      v-show="tooltip.visible"
      ref="tooltipRef"
      class="pointer-events-none absolute z-10"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <ChartTooltip>
        <ChartTooltipHeader>
          <span class="text-card-tooltip-foreground">{{ tooltip.title }}</span>
        </ChartTooltipHeader>
        <ChartTooltipRow
          v-for="(row, i) in tooltip.rows"
          :key="i"
          :color="row.color"
          :label="row.label"
          :value="row.value"
        />
        <p v-if="tooltip.description" class="text-muted-foreground mt-1 max-w-64 text-xs">{{ tooltip.description }}</p>
      </ChartTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currentTheme } from '@/common/utils/color-theme';
import { ChartTooltip, ChartTooltipHeader, ChartTooltipRow } from '@/components/common/charts/chart-tooltip';
import { useFormatCurrency } from '@/composable';
import { getChartColors } from '@/composable/charts/chart-colors';
import { useChartTooltipPosition } from '@/composable/charts/use-chart-tooltip-position';
import { useDateLocale } from '@/composable/use-date-locale';
import { useCurrenciesStore } from '@/stores';
import * as d3 from 'd3';
import { useResizeObserver } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  CASH_NODE_ID,
  DEFICIT_NODE_ID,
  type MoneyFlow,
  type MoneyFlowNode,
  OTHER_NODE_ID,
  formatShare,
  nodeColor,
  nodeLabel,
} from '../utils/build-money-flow';

const props = defineProps<{
  flow: MoneyFlow;
}>();

const { t } = useI18n();
const { locale } = useDateLocale();
const { formatBaseCurrency, formatCompactAmount } = useFormatCurrency();
const { baseCurrency } = storeToRefs(useCurrenciesStore());

const containerRef = ref<HTMLDivElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  title: '',
  rows: [] as TooltipRow[],
  description: '',
});

const { updateTooltipPosition } = useChartTooltipPosition({ containerRef, tooltipRef, tooltip });

const NODE_WIDTH = 12;
const HUB_WIDTH = 24;
const NODE_GAP = 12;
// Column positions as a share of the ribbon span. Hub→mid carries two fat ribbons and
// needs little room; the fan-out to categories on the right is where curves get crowded.
const HUB_POSITION = 0.3;
const MID_POSITION = 0.52;
const ROW_HEIGHT = 48;
const MIN_HEIGHT = 400;
const LABEL_OFFSET = 12;
const LABEL_ROW_HEIGHT = 20;
const DETAIL_ROW_HEIGHT = 36;
const DETAIL_MIN_NODE_HEIGHT = 36;
// Label columns are reserved up front so the bars stay put when the period changes.
const LABEL_COLUMN_MAX = 180;
const LABEL_COLUMN_MIN = 120;
const LABEL_COLUMN_SHARE = 0.2;
const LABEL_FONT_SIZE = 14;
const DETAIL_FONT_SIZE = 13;
const OTHER_TOOLTIP_MAX_ROWS = 20;

interface Box {
  y0: number;
  y1: number;
}

const stack = ({ values, scale }: { values: number[]; scale: number }): Box[] => {
  let cursor = 0;
  return values.map((value) => {
    const box = { y0: cursor, y1: cursor + value * scale };
    cursor = box.y1 + NODE_GAP;
    return box;
  });
};

const ribbon = ({ x0, x1, a, b }: { x0: number; x1: number; a: Box; b: Box }) => {
  const xm = (x0 + x1) / 2;
  return `M${x0} ${a.y0} C ${xm} ${a.y0}, ${xm} ${b.y0}, ${x1} ${b.y0} L ${x1} ${b.y1} C ${xm} ${b.y1}, ${xm} ${a.y1}, ${x0} ${a.y1} Z`;
};

const measureCtx = document.createElement('canvas').getContext('2d');
const textWidth = ({ text, font }: { text: string; font: string }) => {
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

const fitText = ({ text, font, max }: { text: string; font: string; max: number }) => {
  if (textWidth({ text, font }) <= max) return text;
  let end = text.length;
  while (end > 1 && textWidth({ text: `${text.slice(0, end).trimEnd()}…`, font }) > max) end--;
  return `${text.slice(0, end).trimEnd()}…`;
};

interface TooltipContent {
  title: string;
  rows: TooltipRow[];
  description?: string;
}

const bindTooltip = <T extends d3.BaseType>({
  selection,
  content,
}: {
  selection: d3.Selection<T, unknown, null, undefined>;
  content: TooltipContent;
}) =>
  selection
    .on('mouseenter', (event: MouseEvent) => {
      tooltip.title = content.title;
      tooltip.rows = content.rows;
      tooltip.description = content.description ?? '';
      tooltip.visible = true;
      updateTooltipPosition(event);
    })
    .on('mousemove', (event: MouseEvent) => updateTooltipPosition(event))
    .on('mouseleave', () => {
      tooltip.visible = false;
    });

const renderChart = () => {
  const currencyCode = baseCurrency.value?.currency?.code;
  if (!svgRef.value || !containerRef.value || !currencyCode) return;

  const { flow } = props;
  // Everything the hub receives (income plus deficit) equals everything it sends out.
  const hub = flow.expenses + flow.savings;

  const colors = getChartColors();
  const width = containerRef.value.clientWidth;
  const fontFamily = getComputedStyle(svgRef.value).fontFamily;
  const nameFont = `600 ${LABEL_FONT_SIZE}px ${fontFamily}`;
  const detailFont = `${DETAIL_FONT_SIZE}px ${fontFamily}`;
  const labelColumn = Math.round(Math.min(LABEL_COLUMN_MAX, Math.max(LABEL_COLUMN_MIN, width * LABEL_COLUMN_SHARE)));
  const labelMaxWidth = labelColumn - LABEL_OFFSET;
  const compactAmount = (value: number) => formatCompactAmount(value, currencyCode);

  // Label rows: name plus amount on one line, or stacked when the node is tall enough
  // to own two lines. The name is truncated to whatever the column has left after the amount.
  interface LabelRow {
    node: MoneyFlowNode;
    box: Box;
    content: TooltipContent;
    name: string;
    amount: string;
    share: string;
    detailed: boolean;
  }
  const labelRow = ({ node, box, content }: { node: MoneyFlowNode; box: Box; content: TooltipContent }): LabelRow => {
    const detailed = box.y1 - box.y0 >= DETAIL_MIN_NODE_HEIGHT;
    const amount = compactAmount(node.value);
    const share = `(${formatShare(node.share)})`;
    const detailWidth = textWidth({ text: `${amount} ${share}`, font: detailFont });
    const name = fitText({
      text: nodeLabel({ node, t }),
      font: nameFont,
      max: detailed ? labelMaxWidth : labelMaxWidth - detailWidth - 5,
    });
    return {
      node,
      box,
      content,
      name,
      amount,
      share,
      detailed,
    };
  };
  const amountRow = ({ value, color }: { value: number; color: string }): TooltipRow => ({
    label: t('analytics.cashFlow.composition.amount'),
    value: formatBaseCurrency(value),
    color,
  });
  const categoryTooltip = ({
    node,
    color,
    shareLabel,
  }: {
    node: MoneyFlowNode;
    color: string;
    shareLabel: string;
  }) => ({
    title:
      node.parentName && node.id !== OTHER_NODE_ID
        ? `${node.parentName} › ${nodeLabel({ node, t })}`
        : nodeLabel({ node, t }),
    rows: [
      amountRow({ value: node.value, color }),
      { label: shareLabel, value: formatShare(node.share) },
      ...otherBreakdownRows({ node, color }),
    ],
  });
  const otherBreakdownRows = ({ node, color }: { node: MoneyFlowNode; color: string }): TooltipRow[] => {
    const children = node.children ?? [];
    const rows = children.slice(0, OTHER_TOOLTIP_MAX_ROWS).map((c) => ({
      label: c.name,
      value: formatBaseCurrency(c.value),
      color: c.color ?? color,
    }));
    const hidden = children.length - rows.length;
    return hidden > 0
      ? [...rows, { label: t('analytics.cashFlow.composition.andMore', { count: hidden }), value: '' }]
      : rows;
  };
  const shareOfIncome = t('analytics.cashFlow.composition.shareOfIncome');
  const shareOfExpenses = t('analytics.cashFlow.composition.shareOfExpenses');
  const shareOfSavings = t('analytics.cashFlow.composition.shareOfSavings');

  const midNodes = [
    { id: 'expenses', name: t('analytics.cashFlow.expenses'), value: flow.expenses, color: colors.appExpense },
    { id: 'savings', name: t('analytics.cashFlow.composition.savings'), value: flow.savings, color: colors.appSavings },
  ].filter((n) => n.value > 0);
  const rightNodes = [...flow.expenseNodes, ...flow.savingsNodes];

  const overspend = Math.max(0, -flow.net);
  const invested = flow.savingsNodes.filter((n) => n.id !== CASH_NODE_ID).reduce((sum, n) => sum + n.value, 0);
  const deficitDescription = () => {
    const money = (v: number) => formatBaseCurrency(v);
    if (overspend && invested) {
      return t('analytics.cashFlow.composition.deficitBoth', {
        overspend: money(overspend),
        invested: money(invested),
      });
    }
    if (overspend) return t('analytics.cashFlow.composition.deficitOverspend', { amount: money(overspend) });
    return t('analytics.cashFlow.composition.deficitInvested', { invested: money(invested), saved: money(flow.net) });
  };
  const leftTooltip = (node: MoneyFlowNode): TooltipContent =>
    node.id === DEFICIT_NODE_ID
      ? {
          title: nodeLabel({ node, t }),
          rows: [amountRow({ value: node.value, color: colors.warningText })],
          description: deficitDescription(),
        }
      : categoryTooltip({ node, color: colors.appIncome, shareLabel: shareOfIncome });
  const midTooltip = (node: (typeof midNodes)[number]) => ({
    title: node.name,
    rows: [
      amountRow({ value: node.value, color: node.color }),
      ...(flow.income > 0 ? [{ label: shareOfIncome, value: formatShare(node.value / flow.income) }] : []),
    ],
  });
  const hubLabel = t(
    flow.sources.some((n) => n.id === DEFICIT_NODE_ID)
      ? 'analytics.cashFlow.composition.incomePlusDeficit'
      : 'analytics.cashFlow.composition.totalIncome',
  );
  const hubTooltip = {
    title: hubLabel,
    rows: [amountRow({ value: hub, color: colors.appIncome })],
  };

  const rows = Math.max(flow.sources.length, midNodes.length, rightNodes.length);
  const height = Math.max(MIN_HEIGHT, rows * ROW_HEIGHT);
  const scale = (height - (rows - 1) * NODE_GAP) / hub;

  const leftBoxes = stack({ values: flow.sources.map((n) => n.value), scale });
  const hubBox: Box = { y0: 0, y1: hub * scale };
  const midBoxes = stack({ values: midNodes.map((n) => n.value), scale });
  const rightBoxes = stack({ values: rightNodes.map((n) => n.value), scale });

  const leftRows = flow.sources.map((node, i) => labelRow({ node, box: leftBoxes[i]!, content: leftTooltip(node) }));
  const rightRows = rightNodes.map((node, i) => {
    const isSavings = i >= flow.expenseNodes.length;
    const fallback = isSavings ? colors.appSavings : colors.appExpense;
    const content = categoryTooltip({
      node,
      color: nodeColor({ node, colors, fallback }),
      shareLabel: isSavings ? shareOfSavings : shareOfExpenses,
    });
    return labelRow({ node, box: rightBoxes[i]!, content });
  });
  const xLeft = labelColumn;
  const xRight = width - labelColumn - NODE_WIDTH;
  const span = xRight - (xLeft + NODE_WIDTH);
  const xHub = xLeft + NODE_WIDTH + span * HUB_POSITION - HUB_WIDTH / 2;
  const xMid = xLeft + NODE_WIDTH + span * MID_POSITION - HUB_WIDTH / 2;

  const svg = d3.select(svgRef.value);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);

  const links = svg.append('g');
  const nodes = svg.append('g');
  const labels = svg.append('g').attr('font-size', LABEL_FONT_SIZE);

  const drawNode = ({ x, box, w, color }: { x: number; box: Box; w: number; color: string }) =>
    nodes
      .append('rect')
      .attr('x', x)
      .attr('y', box.y0)
      .attr('width', w)
      .attr('height', Math.max(box.y1 - box.y0, 1))
      .attr('rx', 2)
      .attr('fill', color);

  // Labels follow their node's center but never overlap: each row is pushed below the previous one.
  const drawSideLabels = ({ items, x, anchor }: { items: LabelRow[]; x: number; anchor: 'start' | 'end' }) => {
    let cursor = 0;
    const tops = items.map((row) => {
      const rowHeight = row.detailed ? DETAIL_ROW_HEIGHT : LABEL_ROW_HEIGHT;
      const top = Math.max((row.box.y0 + row.box.y1) / 2 - rowHeight / 2, cursor);
      cursor = top + rowHeight;
      return top;
    });
    const overflow = Math.max(0, cursor - height);
    items.forEach((row, i) => {
      const top = tops[i]! - overflow;
      const group = bindTooltip({ selection: labels.append('g'), content: row.content });
      const name = group
        .append('text')
        .attr('x', x)
        .attr('y', top + 14)
        .attr('text-anchor', anchor)
        .attr('fill', colors.foreground)
        .attr('font-weight', 600)
        .text(row.name);
      const detail = row.detailed
        ? group
            .append('text')
            .attr('x', x)
            .attr('y', top + 30)
            .attr('text-anchor', anchor)
        : name.append('tspan');
      detail.attr('font-size', DETAIL_FONT_SIZE).attr('font-weight', 400);
      detail
        .append('tspan')
        .attr('fill', colors.foreground)
        .text(`${row.detailed ? '' : ' '}${row.amount}`);
      detail.append('tspan').attr('fill', colors.text).text(` ${row.share}`);
    });
  };

  let hubInput = 0;
  flow.sources.forEach((node, i) => {
    const box = leftBoxes[i]!;
    const target = { y0: hubInput, y1: hubInput + node.value * scale };
    hubInput = target.y1;
    const color = nodeColor({ node, colors, fallback: colors.appIncome });
    links
      .append('path')
      .attr('d', ribbon({ x0: xLeft + NODE_WIDTH, x1: xHub, a: box, b: target }))
      .attr('fill', color)
      .attr('fill-opacity', 0.2);
    bindTooltip({ selection: drawNode({ x: xLeft, box, w: NODE_WIDTH, color }), content: leftTooltip(node) });
  });
  drawSideLabels({ x: xLeft - LABEL_OFFSET, anchor: 'end', items: leftRows });

  bindTooltip({
    selection: drawNode({ x: xHub, box: hubBox, w: HUB_WIDTH, color: colors.appIncome }),
    content: hubTooltip,
  });

  let hubOutput = 0;
  midNodes.forEach((node, i) => {
    const box = midBoxes[i]!;
    const source = { y0: hubOutput, y1: hubOutput + node.value * scale };
    hubOutput = source.y1;
    links
      .append('path')
      .attr('d', ribbon({ x0: xHub + HUB_WIDTH, x1: xMid, a: source, b: box }))
      .attr('fill', node.color)
      .attr('fill-opacity', 0.2);
    bindTooltip({ selection: drawNode({ x: xMid, box, w: HUB_WIDTH, color: node.color }), content: midTooltip(node) });
  });

  // Terminal nodes share one column: categories drain the Expenses node, portfolios drain Savings.
  const drawOutflows = ({
    items,
    offset,
    from,
    fallbackColor,
    shareLabel,
  }: {
    items: MoneyFlowNode[];
    offset: number;
    from: Box | undefined;
    fallbackColor: string;
    shareLabel: string;
  }) => {
    let output = from?.y0 ?? 0;
    items.forEach((node, i) => {
      const box = rightBoxes[offset + i]!;
      const source = { y0: output, y1: output + node.value * scale };
      output = source.y1;
      links
        .append('path')
        .attr('d', ribbon({ x0: xMid + HUB_WIDTH, x1: xRight, a: source, b: box }))
        .attr('fill', fallbackColor)
        .attr('fill-opacity', 0.14);
      const color = nodeColor({ node, colors, fallback: fallbackColor });
      bindTooltip({
        selection: drawNode({ x: xRight, box, w: NODE_WIDTH, color }),
        content: categoryTooltip({ node, color, shareLabel }),
      });
    });
  };
  drawOutflows({
    items: flow.expenseNodes,
    offset: 0,
    from: midBoxes[midNodes.findIndex((n) => n.id === 'expenses')],
    fallbackColor: colors.appExpense,
    shareLabel: shareOfExpenses,
  });
  drawOutflows({
    items: flow.savingsNodes,
    offset: flow.expenseNodes.length,
    from: midBoxes[midNodes.findIndex((n) => n.id === 'savings')],
    fallbackColor: colors.appSavings,
    shareLabel: shareOfSavings,
  });
  drawSideLabels({ x: xRight + NODE_WIDTH + LABEL_OFFSET, anchor: 'start', items: rightRows });

  const columnLabel = ({ x, box, text }: { x: number; box: Box; text: string }) =>
    labels
      .append('text')
      .attr('x', x + HUB_WIDTH / 2)
      .attr('y', (box.y0 + box.y1) / 2 + 5)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.foreground)
      .attr('font-size', LABEL_FONT_SIZE)
      .attr('font-weight', 600)
      .attr('paint-order', 'stroke')
      .attr('stroke', colors.card)
      .attr('stroke-width', 3)
      .attr('pointer-events', 'none')
      .text(text);

  columnLabel({ x: xHub, box: hubBox, text: hubLabel });
  midNodes.forEach((node, i) => columnLabel({ x: xMid, box: midBoxes[i]!, text: node.name }));
};

useResizeObserver(containerRef, renderChart);
watch([() => props.flow, locale, currentTheme, baseCurrency], renderChart, { deep: true });
</script>
