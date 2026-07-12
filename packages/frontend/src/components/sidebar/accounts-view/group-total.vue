<script setup lang="ts">
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable/formatters';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

const props = defineProps<{
  /** Amount in the user's base currency. */
  amount: number;
  /** Base currency code the amount is denominated in. */
  currencyCode: string;
  /** Prefix the amount with "≈" because it rolls up figures converted from other currencies. */
  isApprox?: boolean;
  /** Heavier weight for top-level section headers vs. nested group rows. */
  emphasis?: boolean;
  /** Placeholder while the underlying amounts are still loading. */
  loading?: boolean;
}>();

const { formatCompactAmount, formatAmountByCurrencyCode } = useFormatCurrency();

// Below half a cent the amount renders as "0.00" — a total that carries no information,
// so the row stays clean instead of showing "≈$0.00" for empty or netted-out groups.
const ZERO_DISPLAY_EPSILON = 0.005;
const isZero = computed(() => Math.abs(props.amount) < ZERO_DISPLAY_EPSILON);

const prefix = computed(() => (props.isApprox ? '≈ ' : ''));
const compact = computed(() => `${prefix.value}${formatCompactAmount(props.amount, props.currencyCode)}`);
const full = computed(() => `${prefix.value}${formatAmountByCurrencyCode(props.amount, props.currencyCode)}`);
</script>

<template>
  <span v-if="loading" class="bg-muted/30 inline-block h-3.5 w-14 shrink-0 animate-pulse rounded" />
  <DesktopOnlyTooltip v-else-if="!isZero" :content="full">
    <span
      :class="
        cn(
          'text-amount shrink-0 text-sm tabular-nums',
          amount < 0 ? 'text-destructive-text' : 'text-foreground',
          emphasis && 'font-medium',
        )
      "
    >
      {{ compact }}
    </span>
  </DesktopOnlyTooltip>
</template>
