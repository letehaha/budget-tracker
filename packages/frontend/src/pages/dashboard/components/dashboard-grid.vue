<script lang="ts" setup>
import { LayoutGridIcon } from 'lucide-vue-next';
import { VueDraggable } from 'vue-draggable-plus';

import { useDashboardLayout } from '../composables/use-dashboard-layout';
import type { Period } from '../types';
import DashboardAddWidgetPanel from './dashboard-add-widget-panel.vue';
import DashboardWidgetSlot from './dashboard-widget-slot.vue';

defineProps<{
  currentPeriod: Period;
}>();

const {
  isEditMode,
  activeWidgets,
  draftWidgets,
  displayWidgets,
  availableWidgets,
  enterEditMode,
  saveLayout,
  cancelEdit,
  removeWidget,
  addWidget,
  resizeWidget,
  updateWidgetConfig,
} = useDashboardLayout();

defineExpose({
  isEditMode,
  enterEditMode,
  saveLayout,
  cancelEdit,
});

const GRID_CLASSES =
  'grid grid-cols-1 gap-6 md:grid-cols-2 md:[grid-auto-rows:24rem] xl:grid-cols-3 [grid-auto-flow:dense]';
</script>

<template>
  <div>
    <template v-if="displayWidgets.length === 0">
      <div class="text-muted-foreground flex flex-col items-center justify-center gap-3 py-20">
        <LayoutGridIcon class="size-12 opacity-50" />
        <p class="text-sm">{{ $t('dashboard.editMode.emptyState') }}</p>
      </div>
    </template>

    <!-- Edit mode: draggable grid -->
    <VueDraggable
      v-else-if="isEditMode"
      v-model="draftWidgets"
      handle=".drag-handle"
      :animation="200"
      :class="GRID_CLASSES"
    >
      <DashboardWidgetSlot
        v-for="widget in draftWidgets"
        :key="widget.widgetId"
        :widget-config="widget"
        :is-edit-mode="true"
        :current-period="currentPeriod"
        @remove="(widgetId) => removeWidget({ widgetId })"
        @resize="(widgetId, colSpan, rowSpan) => resizeWidget({ widgetId, colSpan, rowSpan })"
        @config-change="(widgetId, key, value) => updateWidgetConfig({ widgetId, key, value })"
      />
    </VueDraggable>

    <!-- Normal mode: static grid -->
    <div v-else :class="GRID_CLASSES">
      <DashboardWidgetSlot
        v-for="widget in activeWidgets"
        :key="widget.widgetId"
        :widget-config="widget"
        :is-edit-mode="false"
        :current-period="currentPeriod"
      />
    </div>

    <div v-if="isEditMode" class="mt-6">
      <DashboardAddWidgetPanel :available-widgets="availableWidgets" @add="(id) => addWidget({ widgetId: id })" />
    </div>
  </div>
</template>
