<template>
  <div class="border-border bg-card space-y-3 rounded-lg border p-4">
    <!-- Row 1: shape controls + utility cluster.
         Outer stays a single non-wrapping row so the utility cluster is always
         pinned top-right; the shape-controls group shrinks (min-w-0) and wraps
         its own items onto extra lines when the row runs out of width. -->
    <div class="flex items-start gap-x-6">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        <PivotDimensionControl
          :label="$t('pivotReport.controls.rows')"
          :items="rowDimensionItems"
          :model-value="rowDimension"
          @update:model-value="(value) => (rowDimension = value as endpointsTypes.PivotRowDimension)"
        />
        <PivotDimensionControl
          :label="$t('pivotReport.controls.columns')"
          :items="granularityItems"
          :model-value="granularity"
          @update:model-value="(value) => (granularity = value as endpointsTypes.PivotGranularity)"
        />
        <PivotDimensionControl
          :label="$t('pivotReport.controls.measure')"
          :items="measureItems"
          :model-value="measure"
          @update:model-value="(value) => (measure = value as endpointsTypes.PivotMeasure)"
        />
      </div>

      <!-- Utility cluster folded behind one button so it stays pinned top-right
           and never competes with the shape controls for row width. -->
      <Popover v-model:open="isSettingsOpen">
        <PopoverTrigger as-child>
          <Button variant="secondary" size="sm" class="shrink-0 gap-1.5">
            <Settings2Icon class="size-4" />
            <span class="hidden @sm/pivot-report:inline">{{ $t('pivotReport.controls.settings') }}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class="w-72 p-0">
          <!-- Saved views -->
          <div class="p-1">
            <div class="flex items-center justify-between gap-2 px-2 pt-1.5 pb-1">
              <p class="text-muted-foreground text-xs font-medium">{{ $t('pivotReport.savedViews.trigger') }}</p>
              <span v-if="!activeViewId" class="text-muted-foreground text-xs">
                {{ $t('pivotReport.savedViews.customView') }}
              </span>
            </div>
            <div class="max-h-56 overflow-y-auto">
              <p v-if="savedViews.length === 0" class="text-muted-foreground px-2 py-3 text-center text-sm">
                {{ $t('pivotReport.savedViews.empty') }}
              </p>
              <div v-for="view in savedViews" :key="view.id" class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  :class="
                    cn(
                      'h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5 font-normal',
                      view.id === activeViewId && 'bg-accent',
                    )
                  "
                  @click="selectView(view.id)"
                >
                  <CheckIcon :class="cn('size-4 shrink-0', view.id === activeViewId ? 'opacity-100' : 'opacity-0')" />
                  <span class="min-w-0 flex-1 truncate text-left">{{ view.name }}</span>
                </Button>
                <DesktopOnlyTooltip :content="$t('common.actions.delete')">
                  <Button
                    variant="ghost-destructive"
                    size="icon-sm"
                    :aria-label="$t('common.actions.delete')"
                    @click="emit('delete-view', { id: view.id })"
                  >
                    <Trash2Icon class="size-3.5" />
                  </Button>
                </DesktopOnlyTooltip>
              </div>
            </div>
            <div class="border-border mt-1 border-t pt-1">
              <Button variant="ghost" size="sm" class="w-full justify-start gap-2" @click="openSaveDialog">
                <PlusIcon class="size-4" />
                {{ $t('pivotReport.savedViews.saveCurrent') }}
              </Button>
            </div>
          </div>

          <!-- Display options -->
          <div class="border-border space-y-3 border-t p-3">
            <p class="text-muted-foreground text-xs font-medium">{{ $t('pivotReport.display.title') }}</p>
            <label class="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>{{ $t('pivotReport.toggles.heatmap') }}</span>
              <Switch v-model="heatmap" />
            </label>
            <label class="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>{{ $t('pivotReport.toggles.percentChange') }}</span>
              <Switch v-model="showDelta" />
            </label>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <!-- Row 2: filter pills -->
    <div class="flex flex-wrap items-center gap-2">
      <DateSelector v-model="period" :presets="periodPresets" :earliest-date="earliestDate">
        <template #trigger="{ triggerText }">
          <FilterPill :label="$t('pivotReport.filters.period')" :value="triggerText" :icon="CalendarIcon" />
        </template>
      </DateSelector>

      <div class="w-fit max-w-full">
        <ComboboxCategories
          v-model:category-ids="categoryIds"
          independent-check-state
          :trigger-class="filterPillClass({ active: categoryIds.length > 0 })"
        />
      </div>

      <div class="w-fit max-w-full">
        <PayeeMultiSelectField
          :payee-ids="payeeIds"
          :trigger-class="filterPillClass({ active: payeeIds.length > 0 })"
          @update:payee-ids="payeeIds = $event"
        />
      </div>

      <div class="w-fit max-w-full">
        <AccountMultiSelectField
          :model-value="accountIds"
          :trigger-class="filterPillClass({ active: accountIds.length > 0 })"
          @update:model-value="accountIds = $event"
        />
      </div>

      <DesktopOnlyTooltip v-if="canReset" :content="$t('pivotReport.filters.resetTooltip')">
        <Button
          type="button"
          variant="ghost"
          class="text-muted-foreground hover:text-foreground flex h-8 min-h-8 w-auto items-center gap-1.5 rounded-md px-3 py-1 text-sm font-normal"
          @click="emit('reset')"
        >
          <RotateCcwIcon class="size-3.5 shrink-0 opacity-70" />
          {{ $t('pivotReport.filters.reset') }}
        </Button>
      </DesktopOnlyTooltip>
    </div>

    <!-- Save-view dialog -->
    <ResponsiveDialog v-model:open="isSaveDialogOpen">
      <template #title>{{ $t('pivotReport.savedViews.dialogTitle') }}</template>
      <template #description>{{ $t('pivotReport.savedViews.dialogDescription') }}</template>

      <form class="space-y-4" @submit.prevent="submitSaveView">
        <InputField
          v-model="newViewName"
          :label="$t('pivotReport.savedViews.nameLabel')"
          :placeholder="$t('pivotReport.savedViews.namePlaceholder')"
          :maxlength="endpointsTypes.SAVED_PIVOT_VIEW_NAME_MAX_LENGTH"
          autofocus
        />
      </form>

      <template #footer="{ close }">
        <Button variant="ghost" @click="close">{{ $t('common.actions.cancel') }}</Button>
        <Button :disabled="!canSubmitView || isSavingView" :loading="isSavingView" @click="submitSaveView">
          {{ $t('common.actions.save') }}
        </Button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import type { SavedPivotView } from '@/api/user-settings';
import ComboboxCategories from '@/components/common/combobox-categories.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import AccountMultiSelectField from '@/components/fields/account-multi-select-field.vue';
import PayeeMultiSelectField from '@/components/fields/payee-multi-select-field.vue';
import { InputField } from '@/components/fields';
import Button from '@/components/lib/ui/button/Button.vue';
import { DateSelector, type DateSelectorPreset } from '@/components/lib/ui/date-selector';
import { type PillTabItem } from '@/components/lib/ui/pill-tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { Switch } from '@/components/lib/ui/switch';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useEarliestTransactionDate } from '@/composable/data-queries/earliest-transaction-date';
import type { Period } from '@/composable/use-period-navigation';
import { cn } from '@/lib/utils';
import { endpointsTypes } from '@bt/shared/types';
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { CalendarIcon, CheckIcon, PlusIcon, RotateCcwIcon, Settings2Icon, Trash2Icon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { filterPillClass } from './filter-pill.helpers';
import FilterPill from './filter-pill.vue';
import PivotDimensionControl from './pivot-dimension-control.vue';

const props = defineProps<{
  savedViews: SavedPivotView[];
  activeViewId: string | null;
  isSavingView: boolean;
  canReset: boolean;
}>();

const emit = defineEmits<{
  'save-view': [payload: { name: string }];
  'select-view': [payload: { id: string }];
  'delete-view': [payload: { id: string }];
  reset: [];
}>();

const rowDimension = defineModel<endpointsTypes.PivotRowDimension>('rowDimension', { required: true });
const granularity = defineModel<endpointsTypes.PivotGranularity>('granularity', { required: true });
const measure = defineModel<endpointsTypes.PivotMeasure>('measure', { required: true });
const period = defineModel<Period>('period', { required: true });
const accountIds = defineModel<string[]>('accountIds', { required: true });
const categoryIds = defineModel<string[]>('categoryIds', { required: true });
const payeeIds = defineModel<string[]>('payeeIds', { required: true });
const heatmap = defineModel<boolean>('heatmap', { required: true });
const showDelta = defineModel<boolean>('showDelta', { required: true });

const { t } = useI18n();
const { earliestDate } = useEarliestTransactionDate();

const rowDimensionItems = computed<PillTabItem[]>(() => [
  { value: 'category', label: t('pivotReport.dimensions.category') },
  { value: 'subcategory', label: t('pivotReport.dimensions.subcategory') },
  { value: 'payee', label: t('pivotReport.dimensions.payee') },
  { value: 'tag', label: t('pivotReport.dimensions.tag') },
]);

const granularityItems = computed<PillTabItem[]>(() => [
  { value: 'yearly', label: t('pivotReport.granularity.yearly') },
  { value: 'quarterly', label: t('pivotReport.granularity.quarterly') },
  { value: 'monthly', label: t('pivotReport.granularity.monthly') },
  { value: 'weekly', label: t('pivotReport.granularity.weekly') },
]);

const measureItems = computed<PillTabItem[]>(() => [
  { value: 'expense', label: t('pivotReport.measure.expense') },
  { value: 'income', label: t('pivotReport.measure.income') },
]);

const periodPresets = computed<DateSelectorPreset[]>(() => [
  {
    label: t('pivotReport.periods.last6Months'),
    getValue: () => ({ from: startOfMonth(subMonths(new Date(), 5)), to: endOfMonth(new Date()) }),
  },
  {
    label: t('pivotReport.periods.last12Months'),
    getValue: () => ({ from: startOfMonth(subMonths(new Date(), 11)), to: endOfMonth(new Date()) }),
  },
  {
    label: t('pivotReport.periods.thisYear'),
    getValue: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
  {
    label: t('pivotReport.periods.previousYear'),
    getValue: () => {
      const prev = subYears(new Date(), 1);
      return { from: startOfYear(prev), to: endOfYear(prev) };
    },
  },
  {
    label: t('pivotReport.periods.last3Years'),
    getValue: () => ({ from: startOfYear(subYears(new Date(), 2)), to: endOfYear(new Date()) }),
  },
  {
    label: t('pivotReport.periods.last5Years'),
    getValue: () => ({ from: startOfYear(subYears(new Date(), 4)), to: endOfYear(new Date()) }),
  },
]);

const isSettingsOpen = ref(false);
const isSaveDialogOpen = ref(false);
const newViewName = ref('');

const canSubmitView = computed(() => {
  const trimmed = newViewName.value.trim();
  return trimmed.length > 0 && trimmed.length <= endpointsTypes.SAVED_PIVOT_VIEW_NAME_MAX_LENGTH;
});

const selectView = (id: string) => {
  emit('select-view', { id });
  isSettingsOpen.value = false;
};

const openSaveDialog = () => {
  newViewName.value = '';
  isSettingsOpen.value = false;
  isSaveDialogOpen.value = true;
};

const submitSaveView = () => {
  if (!canSubmitView.value || props.isSavingView) return;
  emit('save-view', { name: newViewName.value.trim() });
  isSaveDialogOpen.value = false;
};
</script>
