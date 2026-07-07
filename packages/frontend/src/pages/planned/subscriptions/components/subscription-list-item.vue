<script setup lang="ts">
import type { SubscriptionListItem } from '@/api/subscriptions';
import BrandLogo from '@/components/common/brand-logo.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/dropdown-menu';
import Button from '@/components/lib/ui/button/Button.vue';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useFormatCurrency } from '@/composable/formatters';
import { cn } from '@/lib/utils';
import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { CheckIcon, CirclePauseIcon, MoreHorizontalIcon, RepeatIcon, Trash2Icon } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

import LinkedTransactionsBadge from './linked-transactions-badge.vue';
import SubscriptionTypeBadge from './subscription-type-badge.vue';
import { formatFrequency } from '../utils';

const props = defineProps<{
  subscription: SubscriptionListItem;
  isMarkingPaid: boolean;
}>();

const emit = defineEmits<{
  select: [subscription: SubscriptionListItem];
  pay: [subscription: SubscriptionListItem];
  'toggle-active': [subscription: SubscriptionListItem];
  delete: [subscription: SubscriptionListItem];
}>();

const { t } = useI18n();
const { formatAmountByCurrencyCode } = useFormatCurrency();

type OpenPeriod = NonNullable<SubscriptionListItem['currentPeriod']>;

const formatAmount = (): string | null => {
  if (!props.subscription.expectedAmount || !props.subscription.expectedCurrencyCode) return null;
  return formatAmountByCurrencyCode(props.subscription.expectedAmount, props.subscription.expectedCurrencyCode);
};

// A finished installment (completedAt set) reads as "Completed", distinct from a
// manually paused subscription. Both carry isActive=false.
const isCompleted = (): boolean => props.subscription.completedAt != null;

/** Paid-vs-total progress for any capped plan (maxOccurrences set); null otherwise. */
const installmentProgress = (): { paid: number; total: number } | null => {
  if (props.subscription.maxOccurrences == null) return null;
  return { paid: props.subscription.paidPeriodsCount, total: props.subscription.maxOccurrences };
};

function getDaysUntilDue({ dueDate }: { dueDate: string }): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
}

// An item reads as overdue when its open period is stored overdue, or when the
// effective next date has already passed — the latter covers an `upcoming` period
// whose due date has slipped before the daily cron flips the stored status, so a
// past date never shows "in -1 days". Derived next dates (no currentPeriod) are
// always future, so they render as "in N days".
function isDueOverdue({
  nextDueDate,
  currentPeriod,
}: {
  nextDueDate: string;
  currentPeriod: OpenPeriod | null;
}): boolean {
  if (currentPeriod?.status === SUBSCRIPTION_PERIOD_STATUSES.overdue) return true;
  return getDaysUntilDue({ dueDate: nextDueDate }) < 0;
}

function dueLabel({ nextDueDate, currentPeriod }: { nextDueDate: string; currentPeriod: OpenPeriod | null }): string {
  if (isDueOverdue({ nextDueDate, currentPeriod })) {
    return t('planned.subscriptions.periods.overdueBadge');
  }
  return t('planned.subscriptions.periods.inDays', { count: getDaysUntilDue({ dueDate: nextDueDate }) });
}

function dueChipClass({
  nextDueDate,
  currentPeriod,
}: {
  nextDueDate: string;
  currentPeriod: OpenPeriod | null;
}): string {
  return isDueOverdue({ nextDueDate, currentPeriod })
    ? 'bg-destructive/10 text-destructive-text'
    : 'bg-success-text/10 text-success-text';
}
</script>

<template>
  <div
    :class="
      cn(
        'hover:bg-accent/50 grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors @[600px]:flex @[600px]:gap-4',
        !subscription.isActive && 'opacity-60',
      )
    "
    @click="emit('select', subscription)"
  >
    <!-- Name + type badge + status -->
    <div class="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
      <BrandLogo :domain="subscription.logoDomain" :name="subscription.name" class="size-5 shrink-0" />
      <h3 class="min-w-0 truncate font-medium">{{ subscription.name }}</h3>
      <SubscriptionTypeBadge :type="subscription.type" class="shrink-0" />
      <span
        v-if="isCompleted()"
        class="bg-success-text/10 text-success-text inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      >
        <CheckIcon class="size-3" />
        {{ $t('planned.subscriptions.completed') }}
      </span>
      <span
        v-else-if="!subscription.isActive"
        class="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      >
        <CirclePauseIcon class="size-3" />
        {{ $t('planned.subscriptions.paused') }}
      </span>
    </div>

    <!-- Amount + Frequency + Due (own full-width row on mobile) -->
    <div
      class="text-muted-foreground col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm @[600px]:col-span-1 @[600px]:row-auto @[600px]:shrink-0 @[600px]:flex-nowrap"
    >
      <span v-if="formatAmount()" class="text-foreground font-medium">{{ formatAmount() }}</span>
      <span class="flex items-center gap-1">
        <RepeatIcon class="size-3.5 shrink-0" />
        {{ formatFrequency({ frequency: subscription.frequency, t }) }}
      </span>
      <!-- Installment / capped-plan progress -->
      <span v-if="installmentProgress()" class="text-foreground inline-flex items-center text-xs font-medium">
        {{ $t('planned.subscriptions.progress.paidOfTotal', installmentProgress()!) }}
      </span>
      <!-- Due status: renders for every item, using the effective next due date -->
      <span
        v-if="subscription.nextDueDate"
        :class="
          cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            dueChipClass({ nextDueDate: subscription.nextDueDate, currentPeriod: subscription.currentPeriod }),
          )
        "
      >
        {{ dueLabel({ nextDueDate: subscription.nextDueDate, currentPeriod: subscription.currentPeriod }) }}
      </span>
    </div>

    <!-- Category (desktop only) -->
    <span
      v-if="subscription.category"
      class="text-muted-foreground hidden shrink-0 items-center gap-1 text-xs @[600px]:flex"
    >
      <span class="inline-block size-2.5 rounded-full" :style="{ backgroundColor: subscription.category.color }" />
      {{ subscription.category.name }}
    </span>

    <!-- Linked txs + actions (top-right on mobile) -->
    <div
      class="col-start-2 row-start-1 flex items-center justify-end gap-2 justify-self-end @[600px]:col-auto @[600px]:row-auto @[600px]:ml-auto"
      @click.stop
    >
      <LinkedTransactionsBadge :count="subscription.linkedTransactionsCount" />

      <DesktopOnlyTooltip
        v-if="subscription.currentPeriod"
        :content="$t('planned.subscriptions.periods.tooltips.markAsPaid')"
      >
        <Button variant="soft-success" size="icon-sm" :disabled="isMarkingPaid" @click="emit('pay', subscription)">
          <CheckIcon class="size-4" />
        </Button>
      </DesktopOnlyTooltip>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon-sm" :aria-label="$t('planned.subscriptions.actions.more')">
            <MoreHorizontalIcon class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem v-if="!isCompleted()" @select="emit('toggle-active', subscription)">
            <CirclePauseIcon v-if="subscription.isActive" class="size-4" />
            <RepeatIcon v-else class="size-4" />
            {{
              subscription.isActive
                ? $t('planned.subscriptions.pauseSubscription')
                : $t('planned.subscriptions.resumeSubscription')
            }}
          </DropdownMenuItem>
          <DropdownMenuSeparator v-if="!isCompleted()" />
          <DropdownMenuItem
            class="text-destructive-text focus:bg-destructive-text/10 focus:text-destructive-text"
            @select="emit('delete', subscription)"
          >
            <Trash2Icon class="size-4" />
            {{ $t('planned.subscriptions.deleteSubscription') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
