<script setup lang="ts">
import type { ComboboxLabelProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxLabel } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<ComboboxLabelProps & {
  class?: HTMLAttributes['class']
  heading?: string
}>()

const delegatedProps = reactiveOmit(props, 'class', 'heading')
</script>

<template>
  <ComboboxLabel
    v-bind="delegatedProps"
    :class="cn('px-6 text-xs font-medium text-muted-foreground py-1', props.class)"
  >
    {{ heading }}
    <slot />
  </ComboboxLabel>
</template>
