<script setup lang="ts">
import type { ComboboxContentProps as RadixComboboxContentProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxContent } from 'radix-vue'
import { cn } from '@/lib/utils'

interface PointerDownOutsideEvent extends Event {
  type: string
  detail: {
    originalEvent: PointerEvent
  }
}

interface FocusOutsideEvent extends Event {
  type: string
  detail: {
    originalEvent: FocusEvent
  }
}

const props = defineProps<RadixComboboxContentProps & {
  class?: HTMLAttributes['class']
  forceMount?: boolean
}>()

const emits = defineEmits<{
  (e: 'escapeKeyDown', event: KeyboardEvent): void
  (e: 'interactOutside', event: PointerDownOutsideEvent | FocusOutsideEvent): void
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ComboboxContent
    v-bind="delegatedProps"
    :class="cn(' w-full mt-2 bg-background rounded-md border border-input shadow-lg', props.class)"
    @escape-key-down="emits('escapeKeyDown', $event)"
    @interact-outside="emits('interactOutside', $event)"
  >
    <slot />
  </ComboboxContent>
</template>
