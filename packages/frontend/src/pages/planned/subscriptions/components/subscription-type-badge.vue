<script setup lang="ts">
import { SUBSCRIPTION_TYPES } from '@bt/shared/types';

defineProps<{
  type: SUBSCRIPTION_TYPES;
  size?: 'sm' | 'md';
}>();
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full font-medium',
      size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs',
      type === SUBSCRIPTION_TYPES.subscription
        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
        : 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    ]"
  >
    {{
      type === SUBSCRIPTION_TYPES.subscription
        ? $t('planned.subscriptions.typeSubscription')
        : $t('planned.subscriptions.typeBill')
    }}
  </span>
</template>
