<script setup lang="ts">
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-vue-next';
import type { CheckboxRootProps } from 'reka-ui';
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui';
import { type HTMLAttributes, computed } from 'vue';
import type { CheckedState } from './types';

const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<{ 'update:modelValue': [value: CheckedState] }>();

const model = computed({
  get: () => props.modelValue,
  set: (val: CheckedState) => emits('update:modelValue', val),
});
</script>

<template>
  <CheckboxRoot
    v-model="model"
    :disabled="props.disabled"
    :name="props.name"
    :value="props.value"
    :id="props.id"
    :class="
      cn(
        'border-primary ring-offset-background focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground peer size-4 shrink-0 rounded-[3px] border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <CheckboxIndicator class="flex h-full w-full items-center justify-center text-current">
      <slot>
        <CheckIcon class="size-4" />
      </slot>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
