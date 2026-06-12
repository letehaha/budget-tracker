<template>
  <ScrollArea ref="scrollAreaRef" :class="cn(containerClass)" viewport-class="overscroll-none">
    <div :style="{ height: `${totalSize}px`, position: 'relative', width: '100%' }">
      <div
        v-for="row in virtualRows"
        :key="String(row.key)"
        :data-index="row.index"
        :ref="setRowEl"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start}px)`,
        }"
      >
        <slot :item="items[row.index] as T" :index="row.index" />
      </div>
    </div>
  </ScrollArea>
</template>

<script setup lang="ts" generic="T">
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    items: T[];
    /** Tailwind/CSS classes for the scroll container (must include a height constraint). */
    containerClass?: string;
    /** Best-guess row height in px. Rows are remeasured after mount via measureElement. */
    estimateSize?: number;
    overscan?: number;
    getItemKey?: (item: T, index: number) => string | number;
  }>(),
  {
    containerClass: '',
    estimateSize: 44,
    overscan: 8,
    getItemKey: undefined,
  },
);

defineSlots<{
  default(props: { item: T; index: number }): unknown;
}>();

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

function getScrollElement(): HTMLElement | null {
  const viewport = scrollAreaRef.value?.viewportRef as { viewportElement?: HTMLElement | null } | null | undefined;
  return viewport?.viewportElement ?? null;
}

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement,
    estimateSize: () => props.estimateSize,
    overscan: props.overscan,
    getItemKey: props.getItemKey ? (index: number) => props.getItemKey!(props.items[index] as T, index) : undefined,
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

function setRowEl(el: unknown) {
  // Forward both the element (mount) and null (unmount) so TanStack's
  // internal ResizeObserver bookkeeping stays in sync — silently skipping
  // null leaks observers, which manifests as growing CPU on long scrolls.
  if (el === null || el instanceof Element) {
    virtualizer.value.measureElement(el as Element | null);
  }
}
</script>
