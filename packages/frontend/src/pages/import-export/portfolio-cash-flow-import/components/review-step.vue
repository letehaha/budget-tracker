<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useFormatCurrency } from '@/composable';
import { useExecuteCashFlowImport } from '@/composable/data-queries/portfolio-cash-flow-import';
import { useShiftMultiSelect } from '@/composable/shift-multi-select';
import type {
  CashFlowDuplicateMatch,
  CashFlowExecuteResponse,
  CashFlowExecuteRow,
  ExtractedCashFlowRow,
} from '@bt/shared/types';
import { format } from 'date-fns';
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, Loader2Icon } from 'lucide-vue-next';
import { computed, ref, triggerRef } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  portfolioId: number;
  rows: ExtractedCashFlowRow[];
  duplicates: CashFlowDuplicateMatch[];
  modelName: string;
}>();

const emit = defineEmits<{
  (e: 'imported', result: CashFlowExecuteResponse): void;
  (e: 'back'): void;
}>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const { formatAmountByCurrencyCode } = useFormatCurrency();

const includedIds = ref(new Set<number>(props.rows.map((_, i) => i)));
const historicalIds = ref(new Set<number>());

const indexes = computed(() => props.rows.map((_, i) => i));
const identity = (i: number) => i;

const { handleSelection: handleIncludeSelection } = useShiftMultiSelect(includedIds.value, () =>
  triggerRef(includedIds),
);
const { handleSelection: handleHistoricalSelection } = useShiftMultiSelect(historicalIds.value, () =>
  triggerRef(historicalIds),
);

const handleIncludeUpdate = (idx: number, value: boolean) => {
  handleIncludeSelection(value, idx, idx, indexes.value, identity);
};

const handleHistoricalUpdate = (idx: number, value: boolean) => {
  handleHistoricalSelection(value, idx, idx, indexes.value, identity);
};

const allHistorical = ref(false);
const handleAllHistorical = (checked: boolean) => {
  allHistorical.value = checked;
  if (checked) {
    for (let i = 0; i < props.rows.length; i++) historicalIds.value.add(i);
  } else {
    historicalIds.value.clear();
  }
  triggerRef(historicalIds);
};

const duplicatesByRowIndex = computed(() => {
  const map = new Map<number, CashFlowDuplicateMatch[]>();
  for (const dup of props.duplicates) {
    const list = map.get(dup.rowIndex) ?? [];
    list.push(dup);
    map.set(dup.rowIndex, list);
  }
  return map;
});

const includedCount = computed(() => includedIds.value.size);
const historicalCount = computed(() => {
  let count = 0;
  for (const idx of historicalIds.value) {
    if (includedIds.value.has(idx)) count++;
  }
  return count;
});

const formatDate = (iso: string) => {
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
};

const formatDuplicateTooltip = (dup: CashFlowDuplicateMatch): string => {
  const title = t('portfolioCashFlowImport.review.duplicateTooltipTitle');
  const formattedAmount = formatAmountByCurrencyCode(Number(dup.existingAmount), dup.existingCurrencyCode);
  return `${title} #${dup.existingTransferId} · ${formatDate(dup.existingDate)} · ${formattedAmount}`;
};

const executeMutation = useExecuteCashFlowImport();

const handleImport = async () => {
  const payload: CashFlowExecuteRow[] = [];
  for (let idx = 0; idx < props.rows.length; idx++) {
    if (!includedIds.value.has(idx)) continue;
    const row = props.rows[idx]!;
    payload.push({
      date: row.date,
      amount: String(row.amount),
      currencyCode: row.currencyCode,
      direction: row.direction,
      isHistorical: historicalIds.value.has(idx),
      description: row.description ?? null,
    });
  }

  if (payload.length === 0) {
    addNotification({
      text: t('portfolioCashFlowImport.review.noneSelected'),
      type: NotificationType.warning,
    });
    return;
  }

  try {
    const result = await executeMutation.mutateAsync({ portfolioId: props.portfolioId, rows: payload });
    emit('imported', result);
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('portfolioCashFlowImport.notifications.importError'),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <div class="grid gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-muted-foreground text-sm">
        <i18n-t keypath="portfolioCashFlowImport.review.parsedSummary" tag="span">
          <template #count>
            <strong class="text-foreground">{{ rows.length }}</strong>
          </template>
          <template #model>
            <span class="font-medium">{{ modelName }}</span>
          </template>
        </i18n-t>
      </div>

      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox
          :model-value="allHistorical"
          @update:model-value="(v: boolean | 'indeterminate') => handleAllHistorical(v === true)"
        />
        <span class="text-sm">{{ $t('portfolioCashFlowImport.review.markAllHistorical') }}</span>
      </label>
    </div>

    <div class="overflow-x-auto rounded-md border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-muted-foreground text-xs">
          <tr>
            <th class="px-3 py-2 text-left">{{ $t('portfolioCashFlowImport.review.headers.include') }}</th>
            <th class="px-3 py-2 text-left">{{ $t('portfolioCashFlowImport.review.headers.date') }}</th>
            <th class="px-3 py-2 text-left">{{ $t('portfolioCashFlowImport.review.headers.direction') }}</th>
            <th class="px-3 py-2 text-right">{{ $t('portfolioCashFlowImport.review.headers.amount') }}</th>
            <th class="px-3 py-2 text-left">{{ $t('portfolioCashFlowImport.review.headers.historical') }}</th>
            <th class="px-3 py-2 text-left">{{ $t('portfolioCashFlowImport.review.headers.notes') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="(row, idx) in rows" :key="idx" :class="{ 'opacity-60': !includedIds.has(idx) }">
            <td class="px-3 py-2">
              <Checkbox
                :model-value="includedIds.has(idx)"
                @update:model-value="(v: boolean | 'indeterminate') => handleIncludeUpdate(idx, v === true)"
              />
            </td>
            <td class="px-3 py-2">{{ formatDate(row.date) }}</td>
            <td class="px-3 py-2">
              <span class="inline-flex items-center gap-1">
                <ArrowDownIcon v-if="row.direction === 'deposit'" class="text-app-income-color size-3.5" />
                <ArrowUpIcon v-else class="text-app-expense-color size-3.5" />
                {{ $t(`portfolioCashFlowImport.review.direction.${row.direction}`) }}
              </span>
            </td>
            <td class="px-3 py-2 text-right font-medium">
              {{ formatAmountByCurrencyCode(row.amount, row.currencyCode) }}
            </td>
            <td class="px-3 py-2">
              <Checkbox
                :model-value="historicalIds.has(idx)"
                :disabled="!includedIds.has(idx)"
                @update:model-value="(v: boolean | 'indeterminate') => handleHistoricalUpdate(idx, v === true)"
              />
            </td>
            <td class="px-3 py-2">
              <div class="flex flex-wrap items-center gap-2">
                <DesktopOnlyTooltip
                  v-for="dup in duplicatesByRowIndex.get(idx) ?? []"
                  :key="dup.existingTransferId"
                  :content="formatDuplicateTooltip(dup)"
                >
                  <span
                    class="bg-app-expense-color/10 text-app-expense-color inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                  >
                    <AlertTriangleIcon class="size-3" />
                    {{ $t('portfolioCashFlowImport.review.duplicateBadge') }}
                  </span>
                </DesktopOnlyTooltip>
                <span v-if="row.sourceLine" class="text-muted-foreground truncate text-xs" :title="row.sourceLine">
                  {{ row.sourceLine }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between">
      <UiButton type="button" variant="ghost" :disabled="executeMutation.isPending.value" @click="emit('back')">
        {{ $t('portfolioCashFlowImport.review.backButton') }}
      </UiButton>

      <div class="flex items-center gap-3">
        <span class="text-muted-foreground text-xs">
          <i18n-t keypath="portfolioCashFlowImport.review.includedSummary" tag="span">
            <template #included>
              <strong class="text-foreground">{{ includedCount }}</strong>
            </template>
            <template #total>
              {{ rows.length }}
            </template>
            <template #historical>
              {{ historicalCount }}
            </template>
          </i18n-t>
        </span>
        <UiButton
          type="button"
          :disabled="includedCount === 0 || executeMutation.isPending.value"
          @click="handleImport"
        >
          <Loader2Icon v-if="executeMutation.isPending.value" class="mr-2 size-4 animate-spin" />
          {{
            executeMutation.isPending.value
              ? $t('portfolioCashFlowImport.review.importing')
              : $t('portfolioCashFlowImport.review.importButton')
          }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
