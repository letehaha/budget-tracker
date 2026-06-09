<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="text-base font-semibold">{{ $t('loans.detail.events.title') }}</div>
    </CardHeader>
    <CardContent>
      <div v-if="!events.length" class="text-muted-foreground py-6 text-center text-sm">
        {{ $t('loans.detail.events.empty') }}
      </div>
      <ol v-else class="space-y-3">
        <li v-for="(entry, idx) in entries" :key="idx" class="flex gap-3">
          <div
            class="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
          >
            <component :is="entry.icon" class="size-3.5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm">{{ entry.label }}</div>
            <div class="text-muted-foreground mt-0.5 text-xs">{{ entry.dateLabel }}</div>
          </div>
        </li>
      </ol>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useFormatCurrency } from '@/composable/formatters';
import { useDateLocale } from '@/composable/use-date-locale';
import type { LoanEvent } from '@bt/shared/types';
import {
  CheckCircleIcon,
  MessageSquareIcon,
  PercentIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  WalletIcon,
} from '@lucide/vue';
import { parseISO } from 'date-fns';
import { type FunctionalComponent, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ events: LoanEvent[]; currencyCode: string }>();

const { t } = useI18n();
const { format: formatDate } = useDateLocale();
const { formatAmountByCurrencyCode } = useFormatCurrency();

interface TimelineEntry {
  label: string;
  dateLabel: string;
  icon: FunctionalComponent;
}

const ICONS: Record<LoanEvent['type'], FunctionalComponent> = {
  rate_change: PercentIcon,
  term_change: RotateCcwIcon,
  planned_payment_change: WalletIcon,
  note: MessageSquareIcon,
  paid_off: CheckCircleIcon,
  refinanced: RefreshCcwIcon,
};

function describe(event: LoanEvent): string {
  switch (event.type) {
    case 'rate_change':
      return t('loans.detail.events.rateChange', {
        from: event.from.toFixed(2),
        to: event.to.toFixed(2),
      });
    case 'term_change':
      return t('loans.detail.events.termChange', { from: event.from, to: event.to });
    case 'planned_payment_change':
      return t('loans.detail.events.plannedPaymentChange', {
        from: formatAmountByCurrencyCode(event.fromCents / 100, props.currencyCode),
        to: formatAmountByCurrencyCode(event.toCents / 100, props.currencyCode),
      });
    case 'note':
      return event.text;
    case 'paid_off':
      return t('loans.detail.events.paidOff');
    case 'refinanced':
      return t('loans.detail.events.refinanced');
  }
}

const entries = computed<TimelineEntry[]>(() =>
  // Newest first — events array is appended in chronological order, so reverse a shallow copy.
  [...props.events].reverse().map((event) => ({
    label: describe(event),
    dateLabel: formatDate(parseISO(event.at), 'MMM d, yyyy'),
    icon: ICONS[event.type],
  })),
);
</script>
