<template>
  <!-- A custom endpoint publishes no prices, so there is a label instead of a number. -->
  <span v-if="estimate.estimatedCostUsd === null">{{ $t('ai.estimatedCost.setByEndpoint') }}</span>
  <template v-else>
    ${{ estimate.estimatedCostUsd.toFixed(COST_FRACTION_DIGITS) }}
    <span v-if="estimate.usingUserKey" class="text-muted-foreground text-sm">
      {{ $t('ai.estimatedCost.yourApiKey') }}
    </span>
  </template>
</template>

<script setup lang="ts">
import type { StatementCostEstimate } from '@bt/shared/types';

/** A single extraction costs a fraction of a cent, so two decimals would read as $0.00. */
const COST_FRACTION_DIGITS = 4;

defineProps<{ estimate: StatementCostEstimate }>();
</script>
