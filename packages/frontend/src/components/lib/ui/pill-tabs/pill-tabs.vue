<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { nextTick, onMounted, ref, watch } from 'vue';
import { pillTabsContainerVariants, pillTabsIndicatorVariants, pillTabsTriggerVariants, type PillTabsSize } from '.';

const props = withDefaults(
  defineProps<{
    items: { value: string; label: string }[];
    modelValue: string;
    size?: PillTabsSize;
  }>(),
  { size: 'default' },
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
      :class="
        cn(pillTabsTriggerVariants({ size }), modelValue === item.value ? 'text-foreground' : 'text-muted-foreground')
      "
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
