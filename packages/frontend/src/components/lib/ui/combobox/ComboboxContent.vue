<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxContentProps as RekaComboboxContentProps } from 'reka-ui';
import { ComboboxContent } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

interface PointerDownOutsideEvent extends Event {
  type: string;
  detail: {
    originalEvent: PointerEvent;
  };
}

interface FocusOutsideEvent extends Event {
  type: string;
  detail: {
    originalEvent: FocusEvent;
  };
}

const props = defineProps<
  RekaComboboxContentProps & {
    class?: HTMLAttributes['class'];
    forceMount?: boolean;
  }
>();

const emits = defineEmits<{
  (e: 'escapeKeyDown', event: KeyboardEvent): void;
  (e: 'interactOutside', event: PointerDownOutsideEvent | FocusOutsideEvent): void;
}>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ComboboxContent
    v-bind="delegatedProps"
    :class="cn('bg-background border-input mt-2 w-full rounded-md border shadow-lg', props.class)"
    @escape-key-down="emits('escapeKeyDown', $event)"
    @interact-outside="emits('interactOutside', $event)"
  >
    <slot />
  </ComboboxContent>
</template>
