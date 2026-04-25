<template>
  <div ref="containerRef" class="relative overflow-hidden" :style="containerStyle">
    <div class="grid auto-cols-[100%] grid-flow-col" :style="trackStyle">
      <div
        v-for="key in panelKeys"
        :key="key"
        :ref="(el) => registerPanel(key, el as HTMLElement | null)"
        class="self-start transition-opacity"
        :style="{
          opacity: key === modelValue ? 1 : inactiveOpacity,
          transitionDuration: `${duration}ms`,
          transitionTimingFunction: easing,
        }"
        :aria-hidden="key !== modelValue ? 'true' : undefined"
        :inert="key !== modelValue || undefined"
      >
        <slot :name="key" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useElementSize } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots } from 'vue';

const props = withDefaults(
  defineProps<{
    /** The currently active panel key. Must match one of the slot names (or a `panels` entry). */
    modelValue: string;
    /** Optional explicit panel order. Defaults to the order of named slots passed in. */
    panels?: string[];
    /** Visible space between panels during the slide, in px. */
    gap?: number;
    /** Slide / height transition duration in ms. */
    duration?: number;
    easing?: string;
    /** Opacity applied to the inactive panels (0 = invisible, 1 = fully visible). */
    inactiveOpacity?: number;
  }>(),
  {
    panels: undefined,
    gap: 64,
    duration: 320,
    easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    inactiveOpacity: 0.4,
  },
);

const slots = useSlots();
const panelKeys = computed(() => {
  if (props.panels?.length) return props.panels;
  return Object.keys(slots).filter((k) => slots[k]);
});

const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

// Per-panel height tracking — the container animates to the active panel's height.
const panelHeights = ref<Record<string, number>>({});
const observers = new Map<string, ResizeObserver>();

function registerPanel(key: string, el: HTMLElement | null) {
  const old = observers.get(key);
  if (old) {
    old.disconnect();
    observers.delete(key);
  }
  if (el) {
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      panelHeights.value = { ...panelHeights.value, [key]: h };
    });
    ro.observe(el);
    observers.set(key, ro);
  } else if (panelHeights.value[key] !== undefined) {
    const next = { ...panelHeights.value };
    delete next[key];
    panelHeights.value = next;
  }
}

onBeforeUnmount(() => {
  observers.forEach((o) => o.disconnect());
  observers.clear();
});

const activeIndex = computed(() => panelKeys.value.indexOf(props.modelValue));
const activeHeight = computed(() => {
  const h = panelHeights.value[props.modelValue];
  return h && h > 0 ? h : 0;
});

// Avoid animating from 0 → measured-height on first paint.
const heightTransitionEnabled = ref(false);
onMounted(async () => {
  await nextTick();
  requestAnimationFrame(() => {
    heightTransitionEnabled.value = true;
  });
});

const containerStyle = computed(() => ({
  height: activeHeight.value > 0 ? `${activeHeight.value}px` : undefined,
  transition: heightTransitionEnabled.value ? `height ${props.duration}ms ${props.easing}` : undefined,
}));

const trackStyle = computed(() => {
  const idx = activeIndex.value;
  const offset = idx <= 0 ? 0 : idx * (containerWidth.value + props.gap);
  return {
    transform: `translate3d(${-offset}px, 0, 0)`,
    transition: `transform ${props.duration}ms ${props.easing}`,
    columnGap: `${props.gap}px`,
  };
});
</script>
