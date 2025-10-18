<script setup lang="ts">
import { ComboboxRoot, type ComboboxRootEmits, type ComboboxRootProps, useForwardPropsEmits } from 'radix-vue';

const props = defineProps<ComboboxRootProps>();
const emits = defineEmits<ComboboxRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ComboboxRoot v-bind="forwarded" :multiple="props.multiple">
    <slot />
  </ComboboxRoot>
</template>
