<script setup lang="ts">
import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { computed } from 'vue';

const props = defineProps<{
  type: SUBSCRIPTION_TYPES;
  size?: 'sm' | 'md';
}>();

const TYPE_COLOR_CLASS: Record<SUBSCRIPTION_TYPES, string> = {
  [SUBSCRIPTION_TYPES.subscription]: 'bg-subscription-type-subscription/10 text-subscription-type-subscription',
  [SUBSCRIPTION_TYPES.bill]: 'bg-subscription-type-bill/10 text-subscription-type-bill',
  [SUBSCRIPTION_TYPES.installment]: 'bg-subscription-type-installment/10 text-subscription-type-installment',
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
