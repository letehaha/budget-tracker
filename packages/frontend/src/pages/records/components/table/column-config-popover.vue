<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button size="icon-sm" variant="ghost" :aria-label="t('transactions.table.columnConfig.title')">
        <SettingsIcon class="text-muted-foreground size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-72 overflow-hidden p-0" align="end">
      <SlidingPanels v-model="view" :panels="['main', 'columns']">
        <template #main>
          <div class="flex flex-col">
            <header class="border-b px-3 py-2 text-sm font-medium">
              {{ t('transactions.table.columnConfig.title') }}
            </header>

            <div class="flex flex-col p-2">
              <button
                type="button"
                class="hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors"
                @click="view = 'columns'"
              >
                <span class="flex flex-col">
                  <span class="text-sm font-medium">{{ t('transactions.table.columnConfig.columns') }}</span>
                  <span class="text-muted-foreground text-xs">
                    {{ t('transactions.table.columnConfig.visibleCount', { count: visibleCount }) }}
                  </span>
                </span>
                <ChevronRightIcon class="text-muted-foreground size-4" />
              </button>

              <Button variant="outline" size="sm" class="mx-2 my-2" @click="emit('reset')">
                {{ t('transactions.table.columnConfig.resetDefaults') }}
              </Button>
            </div>
          </div>
        </template>

        <template #columns>
          <div class="flex flex-col">
            <header class="flex items-center gap-2 border-b px-2 py-2">
              <Button size="icon-sm" variant="ghost" type="button" @click="view = 'main'">
                <ArrowLeftIcon class="size-4" />
              </Button>
              <span class="text-sm font-medium">{{ t('transactions.table.columnConfig.columns') }}</span>
            </header>

            <VueDraggable
              v-model="draggableColumns"
              handle=".drag-handle"
              :animation="200"
              class="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-2"
            >
              <div
                v-for="item in draggableColumns"
                :key="item.definition.id"
                class="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <GripVerticalIcon class="drag-handle text-muted-foreground size-4 shrink-0 cursor-grab" />
                <label class="flex flex-1 cursor-pointer items-center gap-2">
                  <Checkbox
                    :model-value="item.visible"
                    @update:model-value="() => emit('toggle', item.definition.id)"
                  />
                  <span class="text-sm">{{ t(item.definition.labelKey) }}</span>
                </label>
              </div>
            </VueDraggable>
          </div>
        </template>
      </SlidingPanels>
    </PopoverContent>
  </Popover>
</template>

<script lang="ts" setup>
import SlidingPanels from '@/components/common/sliding-panels.vue';
import { Button } from '@/components/lib/ui/button';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { ArrowLeftIcon, ChevronRightIcon, GripVerticalIcon, SettingsIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { useI18n } from 'vue-i18n';

import { type ColumnDefinition, TABLE_COLUMN } from './columns';

const props = defineProps<{
  configurableColumns: { definition: ColumnDefinition; visible: boolean }[];
}>();

const emit = defineEmits<{
  toggle: [id: TABLE_COLUMN];
  reorder: [orderedIds: TABLE_COLUMN[]];
  reset: [];
}>();

const { t } = useI18n();

const isOpen = ref(false);
const view = ref<'main' | 'columns'>('main');

// Reset to the main view after the popover finishes its close animation.
watch(isOpen, (open) => {
  if (!open) {
    setTimeout(() => {
      view.value = 'main';
    }, 320);
  }
});

const visibleCount = computed(() => props.configurableColumns.filter((item) => item.visible).length);

// VueDraggable mutates its model on drop — keep a local copy and emit the new
// order upward instead of mutating the prop.
const draggableColumns = computed({
  get: () => props.configurableColumns,
  set: (next) => {
    emit(
      'reorder',
      next.map((item) => item.definition.id),
    );
  },
});
</script>
