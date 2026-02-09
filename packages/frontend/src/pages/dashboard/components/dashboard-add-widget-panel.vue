<script lang="ts" setup>
import type { WidgetDefinition } from '@/components/widgets/widget-registry';
import { PlusIcon } from 'lucide-vue-next';

defineProps<{
  availableWidgets: WidgetDefinition[];
}>();

const emit = defineEmits<{
  add: [widgetId: string];
}>();
</script>

<template>
  <div v-if="availableWidgets.length" class="border-border rounded-lg border border-dashed p-4">
    <p class="text-muted-foreground mb-3 text-sm font-medium">{{ $t('dashboard.editMode.addWidgets') }}</p>
    <div class="grid gap-2">
      <button
        v-for="widget in availableWidgets"
        :key="widget.id"
        class="bg-background hover:bg-muted flex items-center gap-3 rounded-md border p-3 text-left transition-colors"
        @click="emit('add', widget.id)"
      >
        <PlusIcon class="text-muted-foreground size-4 shrink-0" />
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ $t(widget.name) }}</p>
          <p class="text-muted-foreground truncate text-xs">{{ $t(widget.description) }}</p>
        </div>
      </button>
    </div>
  </div>
</template>
