<script setup lang="ts">
import type { ComboboxViewportProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxViewport } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<ComboboxViewportProps & {
  class?: HTMLAttributes['class']
  nonce?: string
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ComboboxViewport
    v-bind="delegatedProps"
    :class="cn('p-1', props.class)"
  >
    <slot />
  </ComboboxViewport>
</template>
