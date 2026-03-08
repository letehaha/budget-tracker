<script lang="ts" setup>
import { cn } from '@/lib/utils';
import type { Component } from 'vue';
import { nextTick, onMounted, ref, watch } from 'vue';
import { pillTabsContainerVariants, pillTabsIndicatorVariants, pillTabsTriggerVariants, type PillTabsSize } from '.';

const props = withDefaults(
  defineProps<{
    items: { value: string; label: string; icon?: Component }[];
    modelValue: string;
    size?: PillTabsSize;
    disabled?: boolean;
  }>(),
  { size: 'default', disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const containerRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref({ left: '0px', width: '0px' });

function updateIndicator() {
  if (!containerRef.value) return;
  const activeBtn = containerRef.value.querySelector<HTMLElement>(`[data-value="${props.modelValue}"]`);
  if (!activeBtn) return;

  indicatorStyle.value = {
    left: `${activeBtn.offsetLeft}px`,
    width: `${activeBtn.offsetWidth}px`,
  };
}

onMounted(() => {
  updateIndicator();
});

watch(
  () => props.modelValue,
  () => nextTick(updateIndicator),
);
</script>

<template>
  <div ref="containerRef" :class="cn(pillTabsContainerVariants({ size }))">
    <!-- Sliding indicator -->
    <div :class="cn(pillTabsIndicatorVariants({ size }))" :style="indicatorStyle" />
    <!-- Buttons -->
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :data-value="item.value"
      :disabled="disabled"
      :class="
        cn(
          pillTabsTriggerVariants({ size }),
          modelValue === item.value ? 'text-foreground' : 'text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )
      "
      @click="emit('update:modelValue', item.value)"
    >
      <component :is="item.icon" v-if="item.icon" class="mr-1.5 inline size-4 align-[-3px]" />
      {{ item.label }}
    </button>
  </div>
</template>
