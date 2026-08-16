<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { nextTick, onMounted, ref, watch } from 'vue';
import {
  type PillTabItem,
  type PillTabsSize,
  pillTabsContainerVariants,
  pillTabsIndicatorVariants,
  pillTabsTriggerVariants,
} from '.';

const props = withDefaults(
  defineProps<{
    items: PillTabItem[];
    modelValue: string;
    size?: PillTabsSize;
    disabled?: boolean;
    /** Stretch the track to the parent width with equal-width triggers. */
    fullWidth?: boolean;
  }>(),
  { size: 'default', disabled: false, fullWidth: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const containerRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref({ left: '0px', width: '0px' });

function updateIndicator() {
  if (!containerRef.value) return;
  const activeBtn = containerRef.value.querySelector<HTMLElement>(`[data-value="${props.modelValue}"]`);
  if (!activeBtn) {
    indicatorStyle.value = { left: '0px', width: '0px' };
    return;
  }

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
  <div ref="containerRef" :class="cn(pillTabsContainerVariants({ size }), fullWidth && 'flex w-full self-auto')">
    <!-- Sliding indicator -->
    <div :class="cn(pillTabsIndicatorVariants({ size }))" :style="indicatorStyle" />
    <!-- Buttons -->
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :data-value="item.value"
      :disabled="disabled || item.disabled"
      :class="
        cn(
          pillTabsTriggerVariants({ size }),
          modelValue === item.value ? 'text-foreground' : 'text-muted-foreground',
          (disabled || item.disabled) && 'cursor-not-allowed opacity-50',
          fullWidth && 'flex-1',
        )
      "
      @click="emit('update:modelValue', item.value)"
    >
      <component :is="item.icon" v-if="item.icon" :class="cn('mr-1.5 inline size-4 align-[-3px]', item.iconClass)" />
      {{ item.label }}
    </button>
  </div>
</template>
