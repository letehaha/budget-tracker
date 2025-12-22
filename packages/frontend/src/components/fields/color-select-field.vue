<template>
  <div class="color-select-field">
    <FieldLabel :label="label" only-template>
      <label
        :class="
          cn(
            'border-input bg-background ring-offset-background focus-within:ring-ring relative flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-offset-2',
          )
        "
      >
        <div class="size-5 flex-shrink-0 rounded-full border" :style="{ backgroundColor: modelValue }" />
        <span class="text-muted-foreground flex-1">
          {{ modelValue }}
        </span>
        <input
          type="color"
          :value="modelValue"
          class="absolute left-2 size-6 cursor-pointer opacity-0"
          @input="handleColorChange"
        />
      </label>
    </FieldLabel>
  </div>
</template>

<script setup lang="ts">
import { cn } from '@/lib/utils';

import FieldLabel from './components/field-label.vue';

defineProps<{
  label?: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const handleColorChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};
</script>
