<script lang="ts" setup>
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { useDateLocale } from '@/composable/use-date-locale';
import { type Period } from '@/composable/use-period-navigation';
import { cn } from '@/lib/utils';
import { isSameMonth } from 'date-fns';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import DateSelectorContent from './date-selector-content.vue';
import { type DateSelectorFilterMode, type DateSelectorPreset } from './types';

/**
 * Same API as `DateSelector` but opens the calendar in a ResponsiveDialog
 * (Dialog on desktop, Drawer on mobile) instead of a Popover. Use this when
 * the trigger lives inside another floating layer where popovers would
 * overflow or stack awkwardly.
 *
 * Slots, props, and emits mirror `DateSelector` so a caller can swap one for
 * the other without touching its template wiring.
 */
const props = withDefaults(
  defineProps<{
    modelValue: Period;
    presets?: DateSelectorPreset[];
    earliestDate?: Date;
    contentClassName?: string;
    allowedFilterModes?: DateSelectorFilterMode[];
  }>(),
  {
    presets: undefined,
    earliestDate: undefined,
    contentClassName: undefined,
    allowedFilterModes: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: Period];
}>();

const { t } = useI18n();
const { format } = useDateLocale();

const isOpen = ref(false);

const triggerText = computed(() => {
  const from = props.modelValue.from;
  const to = props.modelValue.to;

  if (isSameMonth(new Date(), to) && isSameMonth(from, to)) {
    return t('common.dateSelector.currentMonth');
  }

  if (from.getMonth() === 0 && from.getDate() === 1 && to.getMonth() === 11 && to.getDate() === 31) {
    return `${from.getFullYear()}`;
  }

  if (isSameMonth(from, to)) {
    return format(from, 'MMM yyyy');
  }

  if (from.getFullYear() === to.getFullYear()) {
    return `${format(from, 'dd MMM')} – ${format(to, 'dd MMM yyyy')}`;
  }

  return `${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}`;
});

function applyAndClose(value: Period) {
  emit('update:modelValue', value);
  isOpen.value = false;
}

function handleCancel() {
  isOpen.value = false;
}
</script>

<template>
  <ResponsiveDialog
    v-model:open="isOpen"
    custom-close
    :dialog-content-class="cn('p-4 md:max-w-2xl md:min-w-150', contentClassName)"
    :drawer-content-class="contentClassName"
  >
    <template #trigger>
      <slot name="trigger" :trigger-text="triggerText" />
    </template>
    <template #title>{{ t('common.dateSelector.dialogTitle') }}</template>

    <DateSelectorContent
      :period="modelValue"
      :presets="presets"
      :earliest-date="earliestDate"
      :allowed-filter-modes="allowedFilterModes"
      @apply="applyAndClose"
      @cancel="handleCancel"
      @preset-apply="applyAndClose"
    />
  </ResponsiveDialog>
</template>
