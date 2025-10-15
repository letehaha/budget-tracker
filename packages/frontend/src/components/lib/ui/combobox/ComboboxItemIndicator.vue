<script setup lang="ts">
import type { ComboboxItemIndicatorProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxItemIndicator } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<ComboboxItemIndicatorProps & {
  class?: HTMLAttributes['class']
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ComboboxItemIndicator
    v-bind="delegatedProps"
    :class="cn('absolute left-0 w-[25px] inline-flex items-center justify-center', props.class)"
  >
    <slot />
  </ComboboxItemIndicator>
</template>
