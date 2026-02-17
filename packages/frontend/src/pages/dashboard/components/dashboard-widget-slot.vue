<script lang="ts" setup>
import type { DashboardWidgetConfig } from '@/api/user-settings';
import { Button } from '@/components/lib/ui/button';
import type { WidgetSize } from '@/components/widgets/widget-registry';
import { WIDGET_REGISTRY } from '@/components/widgets/widget-registry';
import { GripVerticalIcon, XIcon } from 'lucide-vue-next';
import { computed, defineAsyncComponent, provide, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

import type { Period } from '../types';

const { t } = useI18n();

const props = defineProps<{
  widgetConfig: DashboardWidgetConfig;
  isEditMode: boolean;
  canRemove: boolean;
  currentPeriod: Period;
}>();

const emit = defineEmits<{
  remove: [widgetId: string];
  resize: [widgetId: string, colSpan: number, rowSpan: number];
  'config-change': [widgetId: string, key: string, value: unknown];
}>();

provide('dashboard-widget-stretch', true);
provide('dashboard-widget-config', toRef(props, 'widgetConfig'));

const def = computed(() => WIDGET_REGISTRY[props.widgetConfig.widgetId]);

const asyncComponent = computed(() => {
  if (!def.value) return null;
  return defineAsyncComponent(def.value.component);
});

const COL_SPAN_CLASSES: Record<number, string> = {
  1: 'md:col-span-1 xl:col-span-1',
  2: 'md:col-span-2 xl:col-span-2',
  3: 'md:col-span-2 xl:col-span-3',
};

const ROW_SPAN_CLASSES: Record<number, string> = {
  1: '',
  2: 'row-span-2',
};

const colSpanClass = computed(() => COL_SPAN_CLASSES[props.widgetConfig.colSpan] ?? COL_SPAN_CLASSES[1]);
const rowSpanClass = computed(() => ROW_SPAN_CLASSES[props.widgetConfig.rowSpan ?? 1] ?? '');

const componentProps = computed(() => {
  if (!def.value) return {};
  return def.value.needsPeriod ? { selectedPeriod: props.currentPeriod } : {};
});

const isSizeActive = (size: WidgetSize) =>
  props.widgetConfig.colSpan === size.colSpan && (props.widgetConfig.rowSpan ?? 1) === size.rowSpan;

const isConfigChoiceActive = ({ key, value }: { key: string; value: string }) => {
  const current = props.widgetConfig.config?.[key] ?? '';
  return current === value;
};
</script>

<template>
  <div v-if="def" :class="['relative h-full', colSpanClass, rowSpanClass]">
    <component :is="asyncComponent" v-bind="componentProps" />

    <!-- Edit overlay -->
    <div
      v-if="isEditMode"
      class="border-primary/50 pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dashed"
    >
      <!-- Bottom toolbar -->
      <div
        class="bg-background/80 pointer-events-auto absolute right-0 bottom-0 left-0 flex items-center justify-between rounded-b-lg border-t px-2 py-1.5 backdrop-blur-sm"
      >
        <!-- Drag handle -->
        <div class="drag-handle cursor-grab p-1 active:cursor-grabbing">
          <GripVerticalIcon class="text-muted-foreground size-6" />
        </div>

        <div class="flex items-center gap-2">
          <!-- Size buttons -->
          <div v-if="def.allowedSizes.length > 1" class="flex items-center gap-0.5 rounded-md border p-0.5">
            <button
              v-for="size in def.allowedSizes"
              :key="`${size.colSpan}x${size.rowSpan}`"
              :class="[
                'rounded px-2 py-0.5 text-xs transition-colors',
                isSizeActive(size) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
              ]"
              @click="emit('resize', widgetConfig.widgetId, size.colSpan, size.rowSpan)"
            >
              {{ size.label }}
            </button>
          </div>

          <!-- Config option buttons -->
          <div
            v-for="option in def.configOptions ?? []"
            :key="option.key"
            class="flex items-center gap-0.5 rounded-md border p-0.5"
          >
            <button
              v-for="choice in option.choices"
              :key="choice.value"
              :class="[
                'rounded px-2 py-0.5 text-xs transition-colors',
                isConfigChoiceActive({ key: option.key, value: choice.value })
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              ]"
              @click="emit('config-change', widgetConfig.widgetId, option.key, choice.value)"
            >
              {{ t(choice.label) }}
            </button>
          </div>
        </div>

        <Button
          variant="destructive"
          size="icon-sm"
          :disabled="!canRemove"
          @click="emit('remove', widgetConfig.widgetId)"
        >
          <XIcon class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
