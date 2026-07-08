<script setup lang="ts">
import { type SubscriptionListItem } from '@/api/subscriptions';
import BrandLogo from '@/components/common/brand-logo.vue';
import { Button } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useSubscriptionsList } from '@/composable/data-queries/subscriptions';
import SubscriptionMarkPaidDialog from '@/pages/planned/subscriptions/components/subscription-mark-paid-dialog.vue';
import { addDays, isBefore, parseISO, startOfDay } from 'date-fns';
import { AlertCircleIcon, CalendarClockIcon, EyeOffIcon } from '@lucide/vue';
import { computed, ref } from 'vue';

/** Payments due within this many days (inclusive) count as upcoming. */
const UPCOMING_DAYS_WINDOW = 3;

const emit = defineEmits<{
  'toggle-hide': [];
}>();

const markPaidDialogRef = ref<InstanceType<typeof SubscriptionMarkPaidDialog> | null>(null);

// Use the subscriptions list rather than the upcoming-payments endpoint because
// SubscriptionListItem includes currentPeriod.id, which SubscriptionMarkPaidDialog
// requires. Client-side filtering mirrors what the upcoming endpoint would return.
const { data: allSubscriptions, isLoading } = useSubscriptionsList({
  filter: { isActive: true },
  staleTime: 60_000,
});

/**
 * Returns all actionable subscriptions sorted overdue-first, then by dueDate ASC.
 * Overdue: currentPeriod.dueDate is before today's start.
 * Upcoming: currentPeriod.dueDate is within [today, today + 3 days].
 */
const relevantSubscriptions = computed((): SubscriptionListItem[] => {
  const items = allSubscriptions.value ?? [];
  const now = new Date();
  const todayStart = startOfDay(now);
  const cutoff = addDays(todayStart, UPCOMING_DAYS_WINDOW + 1);

  return items
    .filter((sub) => {
      const dueDate = sub.currentPeriod?.dueDate;
      if (!dueDate) return false;
      const date = parseISO(dueDate);
      // Overdue (before today start) OR upcoming within the window (before cutoff)
      return isBefore(date, cutoff);
    })
    .sort((a, b) => {
      const aDate = parseISO(a.currentPeriod!.dueDate);
      const bDate = parseISO(b.currentPeriod!.dueDate);
      const aOverdue = isBefore(aDate, todayStart);
      const bOverdue = isBefore(bDate, todayStart);
      // Overdue rows first; within the same bucket sort by dueDate ascending.
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return aDate.getTime() - bDate.getTime();
    });
});

function isOverdue(dateStr: string): boolean {
  return isBefore(parseISO(dateStr), startOfDay(new Date()));
}

function handleMarkPaid(sub: SubscriptionListItem) {
  if (!sub.currentPeriod) return;

  markPaidDialogRef.value?.triggerPay({
    subscription: {
      id: sub.id,
      name: sub.name,
      expectedAmount: sub.expectedAmount ?? null,
      expectedCurrencyCode: sub.expectedCurrencyCode ?? null,
      accountId: sub.accountId ?? null,
    },
    periodId: sub.currentPeriod.id,
  });
}
</script>

<template>
  <div v-if="!isLoading && relevantSubscriptions.length > 0" class="@container/upcoming shrink-0">
    <div class="bg-card flex flex-col gap-3 rounded-xl border px-4 py-3">
      <!-- Header row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <CalendarClockIcon class="text-muted-foreground size-4 shrink-0" />
          <span class="text-sm font-medium">{{ $t('records.upcomingSection.title') }}</span>
        </div>
        <DesktopOnlyTooltip :content="$t('records.upcomingSection.hideToggle')">
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('records.upcomingSection.hideToggle')"
            @click="emit('toggle-hide')"
          >
            <EyeOffIcon class="size-3.5" />
          </Button>
        </DesktopOnlyTooltip>
      </div>

      <!-- One row per actionable subscription (overdue first, then upcoming by dueDate ASC) -->
      <div v-for="sub in relevantSubscriptions" :key="sub.id" class="flex min-w-0 items-center gap-3">
        <BrandLogo :domain="sub.logoDomain ?? null" :name="sub.name" class="size-7 shrink-0" />

        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm leading-tight font-medium">{{ sub.name }}</span>
          <div class="flex items-center gap-1.5">
            <span
              v-if="sub.currentPeriod && isOverdue(sub.currentPeriod.dueDate)"
              class="bg-destructive/10 text-destructive-text inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-none font-medium"
            >
              <AlertCircleIcon class="size-3" />
              {{ $t('records.upcomingSection.overdueBadge') }}
            </span>
            <span
              v-else
              class="text-muted-foreground bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-none font-medium"
            >
              {{ $t('records.upcomingSection.scheduledBadge') }}
            </span>
            <span v-if="sub.expectedAmount != null" class="text-muted-foreground text-xs">
              {{ sub.expectedCurrencyCode }} {{ sub.expectedAmount.toLocaleString() }}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" class="shrink-0" @click="handleMarkPaid(sub)">
          {{ $t('records.upcomingSection.payAction') }}
        </Button>
      </div>
    </div>

    <!-- Mark-paid dialog instance owned here; avoids duplicating it per list row. -->
    <SubscriptionMarkPaidDialog ref="markPaidDialogRef" />
  </div>
</template>
