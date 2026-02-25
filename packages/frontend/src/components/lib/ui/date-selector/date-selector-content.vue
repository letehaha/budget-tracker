<script lang="ts" setup>
import { PillTabs } from '@/components/lib/ui/pill-tabs';
import { useDateLocale } from '@/composable/use-date-locale';
import { type Period } from '@/composable/use-period-navigation';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import Button from '../button/Button.vue';
import DateSelectorDayPanel from './date-selector-day-panel.vue';
import DateSelectorFilterMode from './date-selector-filter-mode.vue';
import DateSelectorFooter from './date-selector-footer.vue';
import DateSelectorPeriodGrid from './date-selector-period-grid.vue';
import DateSelectorPresets from './date-selector-presets.vue';
import { parseDateInput } from './date-selector-utils';
import {
  type DateSelectorFilterMode as DateSelectorFilterModeType,
  type DateSelectorPeriodType,
  type DateSelectorPreset,
} from './types';
import { useDateSelector } from './use-date-selector';

const props = defineProps<{
  period: Period;
  presets?: DateSelectorPreset[];
  earliestDate?: Date;
  allowedFilterModes?: DateSelectorFilterModeType[];
}>();

const emit = defineEmits<{
  apply: [value: Period];
  cancel: [];
  presetApply: [value: Period];
}>();

const { t } = useI18n();
const { format } = useDateLocale();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const {
  activePeriodType,
  activeFilterMode,
  draftDayRange,
  initDraft,
  selectCell,
  getCellState,
  resolvePeriod,
  displayText,
  clearSelection,
  hasSelection,
} = useDateSelector({
  formatFn: format,
  translateFn: t,
  earliestDate: () => props.earliestDate,
});

initDraft({ period: props.period });

// If allowedFilterModes is set and current mode isn't allowed, switch to the first allowed mode
if (props.allowedFilterModes?.length && !props.allowedFilterModes.includes(activeFilterMode.value)) {
  activeFilterMode.value = props.allowedFilterModes[0]!;
}

watch([activePeriodType, activeFilterMode], () => {
  clearSelection();
});

const periodTypeTabs = computed<{ value: DateSelectorPeriodType; label: string }[]>(() => [
  { value: 'day', label: t('common.dateSelector.periodTypes.day') },
  { value: 'month', label: t('common.dateSelector.periodTypes.month') },
  { value: 'quarter', label: t('common.dateSelector.periodTypes.quarter') },
  { value: 'half-year', label: t('common.dateSelector.periodTypes.halfYear') },
  { value: 'year', label: t('common.dateSelector.periodTypes.year') },
]);

const YEAR_START = 2000;

const years = computed(() => {
  const currentYear = new Date().getFullYear();
  const count = currentYear - YEAR_START + 1;
  return Array.from({ length: count }, (_, i) => currentYear - i);
});

const showPresetsSidebar = computed(() => !isMobile.value && activePeriodType.value !== 'day');

const inputValue = ref('');

const placeholderText = computed(() => {
  switch (activePeriodType.value) {
    case 'day':
      return t('common.dateSelector.placeholders.day');
    case 'month':
      return t('common.dateSelector.placeholders.month');
    case 'quarter':
      return t('common.dateSelector.placeholders.quarter');
    case 'half-year':
      return t('common.dateSelector.placeholders.halfYear');
    case 'year':
      return t('common.dateSelector.placeholders.year');
    default:
      return t('common.dateSelector.placeholders.default');
  }
});

function handleInputSubmit() {
  const parsed = parseDateInput({ input: inputValue.value });
  if (!parsed) return;

  activePeriodType.value = parsed.periodType;
  activeFilterMode.value = parsed.filterMode;

  if (parsed.periodType === 'day' && parsed.dayStart && parsed.dayEnd) {
    draftDayRange.value = { start: parsed.dayStart, end: parsed.dayEnd };
  } else {
    selectCell({ year: parsed.start.year, index: parsed.start.index });
  }

  inputValue.value = '';
}

function handleApply() {
  const resolved = resolvePeriod();
  if (resolved) {
    emit('apply', resolved);
  }
}

function handlePresetApply(value: Period) {
  emit('presetApply', value);
}

function handleDayRangeUpdate({ start, end }: { start: Date; end: Date | null }) {
  draftDayRange.value = { start, end };
}

const isDaySingleSelect = computed(() => activePeriodType.value === 'day' && activeFilterMode.value !== 'between');

const numberOfMonths = computed(() => (isMobile.value ? 1 : 2));

function setPeriodType(type: DateSelectorPeriodType) {
  activePeriodType.value = type;
}
</script>

<template>
  <div class="flex max-w-[calc(100vw-3rem)] flex-col gap-3">
    <!-- Label + filter mode -->
    <div class="flex items-center gap-3">
      <span class="text-sm font-semibold whitespace-nowrap">{{ t('common.dateSelector.dueDate') }}</span>
      <DateSelectorFilterMode v-model="activeFilterMode" :allowed-modes="allowedFilterModes" />
    </div>

    <!-- Text input with format placeholder -->
    <input
      v-model="inputValue"
      type="text"
      :placeholder="placeholderText"
      class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
      @keydown.enter="handleInputSubmit"
    />

    <!-- Period type tabs -->
    <PillTabs
      :items="periodTypeTabs"
      :model-value="activePeriodType"
      size="sm"
      class="whitespace-nowrap"
      @update:model-value="setPeriodType($event as DateSelectorPeriodType)"
    />

    <!-- Main content area -->
    <div class="flex gap-4">
      <!-- Presets sidebar — hidden on mobile and when Day tab is active -->
      <div v-if="showPresetsSidebar && presets?.length" class="shrink-0 border-r pr-4">
        <DateSelectorPresets :presets="presets" :current-period="period" @apply="handlePresetApply" />
      </div>

      <!-- Active panel -->
      <div class="min-w-0 flex-1">
        <DateSelectorDayPanel
          v-if="activePeriodType === 'day'"
          :start="draftDayRange.start"
          :end="draftDayRange.end"
          :number-of-months="numberOfMonths"
          :single-select="isDaySingleSelect"
          @update:range="handleDayRangeUpdate"
        />
        <DateSelectorPeriodGrid
          v-else
          :period-type="activePeriodType"
          :years="years"
          :get-cell-state="getCellState"
          @select-cell="selectCell"
        />
      </div>
    </div>

    <!-- Mobile presets — shown below the panel on mobile -->
    <div v-if="isMobile && presets?.length" class="border-t pt-3">
      <DateSelectorPresets horizontal :presets="presets" :current-period="period" @apply="handlePresetApply" />
    </div>

    <!-- Footer -->
    <DateSelectorFooter :apply-disabled="!hasSelection" @cancel="emit('cancel')" @apply="handleApply">
      <Button
        v-if="displayText"
        variant="secondary"
        size="sm"
        class="xxs:min-w-30 flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-center text-sm"
        @click="clearSelection"
      >
        <span class="grow truncate">{{ displayText }}</span>

        <Button as="div" variant="ghost" size="icon-sm" class="ml-auto size-5 shrink-0">
          <X class="size-3" />
        </Button>
      </Button>
    </DateSelectorFooter>
  </div>
</template>
