import { type Period } from '@/composable/use-period-navigation';

export type DateSelectorPeriodType = 'day' | 'month' | 'quarter' | 'half-year' | 'year';
export type DateSelectorFilterMode = 'is' | 'before' | 'after' | 'between';

export interface CellId {
  year: number;
  index: number;
}

export interface CellState {
  isSelected: boolean;
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isDisabled: boolean;
}

export interface DateSelectorPreset {
  label: string;
  getValue: () => Period;
}
