<script setup lang="ts">
import type { FireChart } from '@/composable/fire/build-fire-plan';
import { useDateLocale } from '@/composable/use-date-locale';
import { useElementSize } from '@vueuse/core';
import { computed, useTemplateRef } from 'vue';

import { LABEL_EDGE_PX, PLOT_BOTTOM_PX, PLOT_TOP_PX, buildFirePathGeometry, labelAnchor } from './fire-path-geometry';

const props = defineProps<{
  chart: FireChart;
  targetLabel: string;
}>();

const { format } = useDateLocale();
const container = useTemplateRef<HTMLElement>('container');
const { width, height } = useElementSize(container);

const geometry = computed(() =>
  buildFirePathGeometry({ chart: props.chart, width: width.value, height: height.value }),
);
</script>

<template>
  <div ref="container" class="relative size-full">
    <svg
      v-if="geometry"
      :width="width"
      :height="height"
      class="absolute inset-0 overflow-visible"
      role="img"
      :aria-label="$t('widgets.fireProgress.chart.ariaLabel')"
    >
      <line
        x1="0"
        :x2="width"
        :y1="geometry.targetY"
        :y2="geometry.targetY"
        class="stroke-success-text"
        stroke-width="1.5"
        stroke-dasharray="5 4"
      />

      <path v-if="geometry.historyArea" :d="geometry.historyArea" class="fill-primary-text/15" />
      <path
        v-if="geometry.historyLine"
        :d="geometry.historyLine"
        fill="none"
        class="stroke-primary-text"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <path
        :d="geometry.projectionLine ?? undefined"
        fill="none"
        class="stroke-primary-text"
        stroke-width="2.5"
        stroke-dasharray="5 4"
        stroke-linejoin="round"
      />

      <line
        :x1="geometry.todayX"
        :x2="geometry.todayX"
        :y1="PLOT_TOP_PX"
        :y2="height - PLOT_BOTTOM_PX"
        class="stroke-muted-foreground"
        stroke-dasharray="3 3"
      />
      <text
        v-if="geometry.historyLine || geometry.todayX >= LABEL_EDGE_PX"
        :x="geometry.todayX"
        y="11"
        :text-anchor="labelAnchor({ x: geometry.todayX, width })"
        class="fill-muted-foreground text-[10px] font-semibold"
      >
        {{ $t('widgets.fireProgress.chart.today') }}
      </text>
      <text
        x="4"
        :y="geometry.targetY - 6"
        class="fill-success-text stroke-card text-[11px] font-bold [paint-order:stroke]"
        stroke-width="4"
      >
        {{ targetLabel }}
      </text>

      <template v-for="dot in geometry.milestoneDots" :key="dot.pct">
        <circle :cx="dot.x" :cy="dot.y" r="4" class="fill-card stroke-primary-text" stroke-width="2" />
        <text
          :x="dot.x"
          :y="dot.y - 9"
          text-anchor="middle"
          class="fill-muted-foreground stroke-card text-[10px] font-bold [paint-order:stroke]"
          stroke-width="4"
        >
          {{ dot.pct }}%
        </text>
      </template>

      <template v-if="geometry.fireDot">
        <circle
          :cx="geometry.fireDot.x"
          :cy="geometry.fireDot.y"
          r="6"
          class="fill-primary-text stroke-card"
          stroke-width="2"
        />
        <text
          :x="geometry.fireDot.x"
          :y="geometry.fireDot.y + 20"
          :text-anchor="labelAnchor({ x: geometry.fireDot.x, width })"
          class="fill-primary-text stroke-card text-[10px] font-bold [paint-order:stroke]"
          stroke-width="4"
        >
          {{ format(geometry.fireDot.date, 'LLL yyyy') }}
        </text>
      </template>

      <text x="0" :y="height - 3" class="fill-muted-foreground text-[10px]">
        {{ format(geometry.startDate, 'yyyy') }}
      </text>
      <text :x="width" :y="height - 3" text-anchor="end" class="fill-muted-foreground text-[10px]">
        {{ format(geometry.endDate, 'yyyy') }}
      </text>
    </svg>
  </div>
</template>
