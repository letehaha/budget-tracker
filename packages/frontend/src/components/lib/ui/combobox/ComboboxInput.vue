<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ComboboxInput, type ComboboxInputProps, useForwardPropsEmits } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<ComboboxInputProps & {
  class?: HTMLAttributes['class']
}>()

// const emits = defineEmits()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps)
</script>

<template>
  <ComboboxInput
    :type="'text'"
    v-bind="forwarded"
    :class="cn('w-full bg-transparent outline-none placeholder:text-muted-foreground text-sm', props.class)"
  >
    <slot />
  </ComboboxInput>
</template>
