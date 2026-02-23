<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { nextTick, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    items: { value: string; label: string }[];
    modelValue: string;
    size?: 'sm' | 'default';
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
  <div
    ref="containerRef"
    :class="
      cn(
        'bg-muted/50 relative inline-flex items-center self-start',
        'no-scrollbar max-w-full overflow-x-auto',
        size === 'sm' ? 'rounded-lg px-1 py-0.5' : 'rounded-md p-1',
      )
    "
  >
    <!-- Sliding indicator -->
    <div
      :class="
        cn(
          'bg-background absolute rounded-md shadow-sm transition-all duration-200 ease-out',
          size === 'sm' ? 'top-0.5 bottom-0.5' : 'top-1 bottom-1',
        )
      "
      :style="indicatorStyle"
    />
    <!-- Buttons -->
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :data-value="item.value"
      :class="
        cn(
          'focus-visible:bg-background/50 relative z-1 rounded-md transition-colors focus-visible:outline-none',
          size === 'sm' ? 'px-3 py-0.5 text-sm' : 'px-3 py-1.5 text-sm font-medium',
          modelValue === item.value ? 'text-foreground' : 'text-muted-foreground',
        )
      "
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
