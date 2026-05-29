<script setup lang="ts">
import { getErrorMessage } from '@/common/utils/error-message';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Card, CardContent } from '@/components/lib/ui/card';
import { Checkbox } from '@/components/lib/ui/checkbox';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useDeleteVentureEvent, useVentureEvents } from '@/composable/data-queries/venture/events';
import { useFormatCurrency } from '@/composable/formatters';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE, type VentureEventModel } from '@bt/shared/types';
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CoinsIcon,
  DoorOpenIcon,
  PhoneCallIcon,
  Trash2Icon,
  type LucideIcon,
} from '@lucide/vue';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  dealId: string;
  currencyCode: string;
}>();

const dealIdRef = toRef(props, 'dealId');
const { data: events, isPending } = useVentureEvents(dealIdRef);
const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const deleteMutation = useDeleteVentureEvent(dealIdRef);

const sortedEvents = computed<VentureEventModel[]>(() => {
  if (!events.value) return [];
  return [...events.value].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
});

interface EventVisual {
  icon: LucideIcon;
  tone: 'invest' | 'distribute' | 'fee' | 'nav' | 'writedown' | 'exit';
}

const eventVisual = (type: VENTURE_EVENT_TYPE): EventVisual => {
  switch (type) {
    case VENTURE_EVENT_TYPE.initial_investment:
      return { icon: ArrowDownToLineIcon, tone: 'invest' };
    case VENTURE_EVENT_TYPE.capital_call:
      return { icon: PhoneCallIcon, tone: 'invest' };
    case VENTURE_EVENT_TYPE.fee_payment:
      return { icon: CoinsIcon, tone: 'fee' };
    case VENTURE_EVENT_TYPE.distribution:
      return { icon: ArrowUpFromLineIcon, tone: 'distribute' };
    case VENTURE_EVENT_TYPE.exit:
      return { icon: DoorOpenIcon, tone: 'exit' };
    case VENTURE_EVENT_TYPE.nav_update:
      return { icon: ActivityIcon, tone: 'nav' };
    case VENTURE_EVENT_TYPE.writedown:
      return { icon: AlertTriangleIcon, tone: 'writedown' };
    default:
      return { icon: ActivityIcon, tone: 'nav' };
  }
};

const TONE_STYLES: Record<EventVisual['tone'], { chip: string; icon: string }> = {
  invest: {
    chip: 'bg-app-transfer-color/15 text-app-transfer-color border-app-transfer-color/30',
    icon: 'bg-app-transfer-color/15 text-app-transfer-color',
  },
  distribute: {
    chip: 'bg-app-income-color/15 text-app-income-color border-app-income-color/30',
    icon: 'bg-app-income-color/15 text-app-income-color',
  },
  exit: {
    chip: 'bg-app-income-color/20 text-app-income-color border-app-income-color/40',
    icon: 'bg-app-income-color/20 text-app-income-color',
  },
  fee: {
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  nav: {
    chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    icon: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  writedown: {
    chip: 'bg-destructive/15 text-destructive-text border-destructive/30',
    icon: 'bg-destructive/15 text-destructive-text',
  },
};

const eventTypeLabel = (type: VENTURE_EVENT_TYPE): string => `venture.events.types.${type}`;

const primaryAmount = (event: VentureEventModel): { value: string; label: string } | null => {
  if (event.lpNetAmount !== null && event.lpNetAmount !== undefined) {
    return {
      value: formatAmountByCurrencyCode(Number(event.lpNetAmount), props.currencyCode),
      label: t('venture.events.lpNet'),
    };
  }
  if (event.navAfter !== null && event.navAfter !== undefined) {
    return {
      value: formatAmountByCurrencyCode(Number(event.navAfter), props.currencyCode),
      label: t('venture.events.navAfter'),
    };
  }
  if (event.grossAmount !== null && event.grossAmount !== undefined) {
    return {
      value: formatAmountByCurrencyCode(Number(event.grossAmount), props.currencyCode),
      label: t('venture.events.gross'),
    };
  }
  return null;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const deleteTarget = ref<VentureEventModel | null>(null);
const deleteOpen = ref(false);
const deleteLinkedTx = ref(false);

const hasLinkedTransactions = computed(() => deleteTarget.value?.cashFlowMode === VENTURE_CASH_FLOW_MODE.linked);

const requestDelete = (event: VentureEventModel) => {
  deleteTarget.value = event;
  deleteLinkedTx.value = false;
  deleteOpen.value = true;
};

const onConfirmDelete = async () => {
  if (!deleteTarget.value) return;
  const eventId = deleteTarget.value.id;
  const deleteLinkedTransactions = hasLinkedTransactions.value ? deleteLinkedTx.value : undefined;
  try {
    await deleteMutation.mutateAsync({ eventId, deleteLinkedTransactions });
    addNotification({ text: t('venture.events.notifications.deleted'), type: NotificationType.success });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    addNotification({
      text: getErrorMessage(err, t('venture.events.notifications.error')),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <section>
    <div v-if="isPending" class="bg-muted h-24 animate-pulse rounded" />

    <div
      v-else-if="sortedEvents.length === 0"
      class="border-border bg-card text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm"
    >
      {{ $t('venture.events.emptyTimeline') }}
    </div>

    <ol v-else class="grid gap-3">
      <li v-for="event in sortedEvents" :key="event.id" class="group bg-card border-border rounded-xl border p-4">
        <div class="flex items-start gap-4">
          <div
            :class="[
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              TONE_STYLES[eventVisual(event.type).tone].icon,
            ]"
          >
            <component :is="eventVisual(event.type).icon" class="size-5" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                :class="[
                  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide uppercase',
                  TONE_STYLES[eventVisual(event.type).tone].chip,
                ]"
              >
                {{ $t(eventTypeLabel(event.type)) }}
              </span>
              <span class="text-muted-foreground text-xs">{{ formatDate(event.eventDate) }}</span>
              <span
                v-if="event.cashFlowMode === VENTURE_CASH_FLOW_MODE.out_of_wallet"
                class="border-border text-muted-foreground inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase"
              >
                {{ $t('venture.events.outOfWalletBadge') }}
              </span>
              <span
                v-if="event.gpCarryOverridden || event.lpNetAmountOverridden"
                class="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] tracking-wide text-amber-600 uppercase dark:text-amber-400"
              >
                {{ $t('venture.events.manualBadge') }}
              </span>
            </div>

            <div v-if="primaryAmount(event)" class="mt-2 flex items-baseline gap-2">
              <span class="text-2xl leading-none font-medium tabular-nums">
                {{ primaryAmount(event)!.value }}
              </span>
              <span class="text-muted-foreground text-[11px] tracking-wide uppercase">
                {{ primaryAmount(event)!.label }}
              </span>
            </div>

            <dl
              class="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs @sm/venture-deal:grid-cols-3"
            >
              <div v-if="event.grossAmount !== null && primaryAmount(event)?.label !== $t('venture.events.gross')">
                <dt class="text-[10px] tracking-wide uppercase">{{ $t('venture.events.gross') }}</dt>
                <dd class="text-foreground font-medium tabular-nums">
                  {{ formatAmountByCurrencyCode(Number(event.grossAmount), currencyCode) }}
                </dd>
              </div>
              <div v-if="event.gpCarryAmount !== null && Number(event.gpCarryAmount) > 0">
                <dt class="text-[10px] tracking-wide uppercase">{{ $t('venture.events.carry') }}</dt>
                <dd class="text-foreground font-medium tabular-nums">
                  {{ formatAmountByCurrencyCode(Number(event.gpCarryAmount), currencyCode) }}
                </dd>
              </div>
              <div v-if="event.navAfter !== null && primaryAmount(event)?.label !== $t('venture.events.navAfter')">
                <dt class="text-[10px] tracking-wide uppercase">{{ $t('venture.events.navAfter') }}</dt>
                <dd class="text-foreground font-medium tabular-nums">
                  {{ formatAmountByCurrencyCode(Number(event.navAfter), currencyCode) }}
                </dd>
              </div>
            </dl>

            <p v-if="event.notes" class="text-muted-foreground mt-2 line-clamp-2 text-xs italic">
              {{ event.notes }}
            </p>
          </div>

          <UiButton
            size="icon-sm"
            variant="ghost-destructive"
            class="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="$t('venture.events.deleteEvent')"
            @click="requestDelete(event)"
          >
            <Trash2Icon class="size-4" />
          </UiButton>
        </div>
      </li>
    </ol>

    <ResponsiveAlertDialog
      v-model:open="deleteOpen"
      :confirm-label="$t('venture.events.deleteConfirm')"
      confirm-variant="destructive"
      @confirm="onConfirmDelete"
    >
      <template #title>{{ $t('venture.events.deleteTitle') }}</template>
      <template #description>{{ $t('venture.events.deleteDescription') }}</template>
      <label v-if="hasLinkedTransactions" class="mt-2 flex items-center gap-2 text-sm">
        <Checkbox v-model="deleteLinkedTx" />
        <span>{{ $t('venture.events.deleteLinkedTransactionsLabel') }}</span>
      </label>
    </ResponsiveAlertDialog>
  </section>
</template>
