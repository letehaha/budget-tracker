<script setup lang="ts">
import type { SelectRootEmits, SelectRootProps } from 'radix-vue';
import { SelectRoot, useForwardPropsEmits } from 'radix-vue';
import { provide, ref } from 'vue';

import { PROVIDER_NAME } from './types';

const props = defineProps<SelectRootProps>();
const emits = defineEmits<SelectRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
const isOpen = ref(false);
provide(PROVIDER_NAME, isOpen);
</script>

<template>
  <SelectRoot v-bind="forwarded" :open="isOpen" @update:open="isOpen = $event">
    <slot />
  </SelectRoot>
</template>
