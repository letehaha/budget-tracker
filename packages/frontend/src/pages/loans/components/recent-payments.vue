<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('loans.detail.payments.title') }}</div>
    </CardHeader>
    <CardContent>
      <div v-if="paymentsQuery.isLoading.value" class="space-y-2">
        <div v-for="i in 3" :key="i" class="flex items-center justify-between gap-3">
          <div class="bg-muted h-4 w-32 animate-pulse rounded" />
          <div class="bg-muted h-4 w-20 animate-pulse rounded" />
        </div>
      </div>

      <div v-else-if="paymentsQuery.error.value" class="text-destructive-text py-3 text-sm">
        {{ $t('loans.detail.payments.loadError') }}
      </div>

      <div v-else-if="!payments.length" class="text-muted-foreground py-6 text-center text-sm">
        {{ $t('loans.detail.payments.empty') }}
      </div>

      <ul v-else class="divide-border divide-y">
        <li v-for="payment in payments" :key="payment.id" class="flex items-center justify-between gap-3 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">{{ payment.note || $t('loans.detail.payments.unlabeled') }}</div>
            <div class="text-muted-foreground mt-0.5 text-xs">{{ formatTime(payment.time) }}</div>
          </div>
          <div class="text-app-income-color shrink-0 text-sm font-medium">
            +{{ formatAmountByCurrencyCode(Math.abs(payment.amount), currencyCode) }}
          </div>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { loadTransactions } from '@/api/transactions';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

const props = defineProps<{ accountId: string; currencyCode: string }>();

const RECENT_PAYMENTS_LIMIT = 10;

const { formatAmountByCurrencyCode } = useFormatCurrency();
const { format: formatDate } = useDateLocale();

const paymentsQuery = useQuery({
  queryKey: computed(() => ['loan-recent-payments', props.accountId] as const),
  queryFn: () =>
    loadTransactions({
      from: 0,
      limit: RECENT_PAYMENTS_LIMIT,
      accountIds: [props.accountId],
    }),
  staleTime: 1000 * 60 * 5,
});

// On a loan account, paid principal arrives as an income leg (positive amount).
// Interest charges and disbursements show up as negative legs — filter those
// out so the section reads as "money you sent against this loan".
const payments = computed(() =>
  (paymentsQuery.data.value ?? []).filter((tx) => tx.transactionType === TRANSACTION_TYPES.income),
);

const formatTime = (time: Date | string) => formatDate(typeof time === 'string' ? new Date(time) : time, 'MMM d, yyyy');
</script>
