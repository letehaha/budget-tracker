<script setup lang="ts">
import { cn } from '@/lib/utils';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    class?: string;
  }>(),
  {
    modelValue: 0,
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const sliderValue = computed({
  get: () => [props.modelValue],
  set: (val: number[]) => {
    emit('update:modelValue', val[0]!);
  },
});
</script>

<template>
  <SliderRoot
    v-model="sliderValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :class="
      cn(
        'relative flex w-full touch-none items-center select-none',
        disabled && 'cursor-not-allowed opacity-50',
        props.class,
      )
    "
  >
    <SliderTrack class="bg-secondary relative h-2 w-full grow overflow-hidden rounded-full">
      <SliderRange class="bg-primary absolute h-full" />
    </SliderTrack>
    <SliderThumb
      class="bg-background border-primary block size-5 rounded-full border-2 shadow transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
