<script setup lang="ts">
import { CollapsibleRoot } from 'reka-ui';
import type { CollapsibleRootEmits, CollapsibleRootProps } from 'reka-ui';
import { ref, watch } from 'vue';

const props = defineProps<CollapsibleRootProps>();
const emits = defineEmits<CollapsibleRootEmits>();

// Internal state for uncontrolled mode
const internalOpen = ref(props.defaultOpen || props.open || false);

// Sync with controlled mode if `open` prop is provided
watch(
  () => props.open,
  (newVal) => {
    if (newVal !== undefined) {
      internalOpen.value = newVal;
    }
  },
);

function handleOpenChange(value: boolean) {
  internalOpen.value = value;
  emits('update:open', value);
}
</script>

<template>
  <CollapsibleRoot :open="internalOpen" @update:open="handleOpenChange">
    <slot :open="internalOpen" />
  </CollapsibleRoot>
</template>
