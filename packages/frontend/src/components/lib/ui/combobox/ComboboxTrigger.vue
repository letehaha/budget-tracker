<script setup lang="ts">
import { cn } from '@/lib/utils';
import { reactiveOmit } from '@vueuse/core';
import type { ComboboxTriggerProps } from 'reka-ui';
import { ComboboxTrigger, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = defineProps<ComboboxTriggerProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxTrigger v-bind="forwarded" :class="cn('', props.class)" tabindex="0">
    <slot />
  </ComboboxTrigger>
</template>
