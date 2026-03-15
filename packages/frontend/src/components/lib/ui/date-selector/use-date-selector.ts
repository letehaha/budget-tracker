import { type Period } from '@/composable/use-period-navigation';
import { endOfDay, endOfMonth, startOfDay } from 'date-fns';
import { type Ref, computed, ref } from 'vue';

import {
  cellToLinearIndex,
  formatDateSelectorValue,
  getPeriodBoundaries,
  inferFilterMode,
  inferPeriodType,
  isFutureCell,
  periodToCellId,
} from './date-selector-utils';
import { type CellId, type CellState, type DateSelectorFilterMode, type DateSelectorPeriodType } from './types';

export function useDateSelector({
  formatFn,
  translateFn,
  earliestDate,
}: {
  formatFn: (date: Date, pattern: string) => string;
  translateFn: (key: string) => string;
  earliestDate?: () => Date | undefined;
}) {
  const activePeriodType: Ref<DateSelectorPeriodType> = ref('month');
  const activeFilterMode: Ref<DateSelectorFilterMode> = ref('is');

  const draftSelection: Ref<{ start: CellId | null; end: CellId | null }> = ref({
    start: null,
    end: null,
  });

  const draftDayRange: Ref<{ start: Date | null; end: Date | null }> = ref({
    start: null,
    end: null,
  });

  /** Initialize draft state from an existing period */
  function initDraft({ period }: { period: Period }) {
    const inferred = inferPeriodType({ period });
    activePeriodType.value = inferred;
    activeFilterMode.value = inferFilterMode({ period, periodType: inferred });

    if (inferred === 'day') {
      draftDayRange.value = { start: period.from, end: period.to };
      draftSelection.value = { start: null, end: null };
    } else {
      const cells = periodToCellId({ period, periodType: inferred });
      draftSelection.value = { start: cells.start, end: cells.end };
      draftDayRange.value = { start: null, end: null };
    }
  }

  /** Handle cell click in the grid */
  function selectCell({ year, index }: { year: number; index: number }) {
    if (isFutureCell({ periodType: activePeriodType.value, year, index })) return;

    const cell: CellId = { year, index };

    if (activeFilterMode.value === 'between') {
      if (!draftSelection.value.start || draftSelection.value.end) {
        // Start new range
        draftSelection.value = { start: cell, end: null };
      } else {
        // Complete the range, ensure start <= end
        const startLin = cellToLinearIndex({
          periodType: activePeriodType.value,
          ...draftSelection.value.start,
        });
        const endLin = cellToLinearIndex({
          periodType: activePeriodType.value,
          ...cell,
        });

        if (endLin < startLin) {
          draftSelection.value = { start: cell, end: draftSelection.value.start };
        } else {
          draftSelection.value = { ...draftSelection.value, end: cell };
        }
      }
    } else {
      // is, before, after — single selection
      draftSelection.value = { start: cell, end: null };
    }
  }

  /** Get the visual state of a grid cell */
  function getCellState({ year, index }: { year: number; index: number }): CellState {
    const disabled = isFutureCell({ periodType: activePeriodType.value, year, index });
    const { start, end } = draftSelection.value;

    if (!start) {
      return { isSelected: false, isInRange: false, isRangeStart: false, isRangeEnd: false, isDisabled: disabled };
    }

    const cellLin = cellToLinearIndex({ periodType: activePeriodType.value, year, index });
    const startLin = cellToLinearIndex({ periodType: activePeriodType.value, ...start });

    if (activeFilterMode.value !== 'between' || !end) {
      const selected = cellLin === startLin;
      return { isSelected: selected, isInRange: false, isRangeStart: false, isRangeEnd: false, isDisabled: disabled };
    }

    const endLin = cellToLinearIndex({ periodType: activePeriodType.value, ...end });
    const isStart = cellLin === startLin;
    const isEnd = cellLin === endLin;
    const isInRange = cellLin > startLin && cellLin < endLin;

    return {
      isSelected: isStart || isEnd,
      isInRange,
      isRangeStart: isStart,
      isRangeEnd: isEnd,
      isDisabled: disabled,
    };
  }

  /** Resolve the current draft into a Period */
  function resolvePeriod(): Period | null {
    if (activePeriodType.value === 'day') {
      const { start, end } = draftDayRange.value;
      if (!start) return null;

      switch (activeFilterMode.value) {
        case 'is':
          return { from: startOfDay(start), to: endOfDay(start) };
        case 'before': {
          const earliest = earliestDate?.() ?? new Date(2000, 0, 1);
          return { from: earliest, to: endOfDay(start) };
        }
        case 'after':
          return { from: startOfDay(start), to: endOfMonth(new Date()) };
        case 'between':
          if (!end) return null;
          return { from: startOfDay(start), to: endOfDay(end) };
        default:
          return null;
      }
    }

    const { start, end } = draftSelection.value;
    if (!start) return null;

    const pt = activePeriodType.value;

    switch (activeFilterMode.value) {
      case 'is': {
        const bounds = getPeriodBoundaries({ periodType: pt, ...start });
        return { from: bounds.start, to: bounds.end };
      }
      case 'before': {
        const bounds = getPeriodBoundaries({ periodType: pt, ...start });
        const earliest = earliestDate?.() ?? new Date(2000, 0, 1);
        return { from: earliest, to: bounds.end };
      }
      case 'after': {
        const bounds = getPeriodBoundaries({ periodType: pt, ...start });
        return { from: bounds.start, to: endOfMonth(new Date()) };
      }
      case 'between': {
        if (!end) return null;
        const startBounds = getPeriodBoundaries({ periodType: pt, ...start });
        const endBounds = getPeriodBoundaries({ periodType: pt, ...end });
        return { from: startBounds.start, to: endBounds.end };
      }
      default:
        return null;
    }
  }

  /** Formatted display text for the current draft */
  const displayText = computed(() => {
    if (activePeriodType.value === 'day') {
      const { start, end } = draftDayRange.value;
      if (!start) return '';

      const fmtStart = formatFn(start, 'dd MMM yyyy');

      switch (activeFilterMode.value) {
        case 'is':
          return fmtStart;
        case 'before':
          return `${translateFn('common.dateSelector.filterModes.before')} ${fmtStart}`;
        case 'after':
          return `${translateFn('common.dateSelector.filterModes.after')} ${fmtStart}`;
        case 'between':
          if (!end) return fmtStart;
          return `${fmtStart} – ${formatFn(end, 'dd MMM yyyy')}`;
        default:
          return '';
      }
    }

    return formatDateSelectorValue({
      periodType: activePeriodType.value,
      filterMode: activeFilterMode.value,
      start: draftSelection.value.start,
      end: draftSelection.value.end,
      formatFn,
      translateFn,
    });
  });

  /** Clear the current draft selection */
  function clearSelection() {
    draftSelection.value = { start: null, end: null };
    draftDayRange.value = { start: null, end: null };
  }

  /** Check if the draft has a valid selection */
  const hasSelection = computed(() => {
    if (activePeriodType.value === 'day') {
      if (activeFilterMode.value === 'between') {
        return !!draftDayRange.value.start && !!draftDayRange.value.end;
      }
      return !!draftDayRange.value.start;
    }

    if (activeFilterMode.value === 'between') {
      return !!draftSelection.value.start && !!draftSelection.value.end;
    }

    return !!draftSelection.value.start;
  });

  return {
    activePeriodType,
    activeFilterMode,
    draftSelection,
    draftDayRange,
    initDraft,
    selectCell,
    getCellState,
    resolvePeriod,
    displayText,
    clearSelection,
    hasSelection,
  };
}
