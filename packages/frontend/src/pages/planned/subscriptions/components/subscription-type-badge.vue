<script setup lang="ts">
import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{
  type: SUBSCRIPTION_TYPES;
  size?: 'sm' | 'md';
}>();

// Raw Tailwind palette, one hue per type (this badge predates the global.css
// color tokens): subscription=blue, bill=orange, installment=purple.
const TYPE_COLOR_CLASS: Record<SUBSCRIPTION_TYPES, string> = {
  [SUBSCRIPTION_TYPES.subscription]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  [SUBSCRIPTION_TYPES.bill]: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  [SUBSCRIPTION_TYPES.installment]: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const TYPE_LABEL_KEY: Record<SUBSCRIPTION_TYPES, string> = {
  [SUBSCRIPTION_TYPES.subscription]: 'planned.subscriptions.typeSubscription',
  [SUBSCRIPTION_TYPES.bill]: 'planned.subscriptions.typeBill',
  [SUBSCRIPTION_TYPES.installment]: 'planned.subscriptions.typeInstallment',
};

const colorClass = computed(() => TYPE_COLOR_CLASS[props.type]);
const labelKey = computed(() => TYPE_LABEL_KEY[props.type]);
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full font-medium',
      size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs',
      colorClass,
    ]"
  >
    {{ $t(labelKey) }}
  </span>
</template>
