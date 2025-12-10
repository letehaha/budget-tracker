<script setup lang="ts">
import { CollapsibleRoot, useEmitAsProps } from 'reka-ui';
import type { CollapsibleRootEmits, CollapsibleRootProps } from 'reka-ui';

const props = defineProps<CollapsibleRootProps>();
const emits = defineEmits<CollapsibleRootEmits>();
</script>

<template>
  <CollapsibleRoot v-slot="{ open }" v-bind="{ ...props, ...useEmitAsProps(emits) }">
    <slot :open="open" />
  </CollapsibleRoot>
</template>
