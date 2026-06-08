<script lang="ts" setup>
import { useDateLocale } from '@/composable/use-date-locale';
import { type Period } from '@/composable/use-period-navigation';
import { isSameMonth } from 'date-fns';
import { VisuallyHidden } from 'reka-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../dialog';
import DateSelectorContent from './date-selector-content.vue';
import { type DateSelectorFilterMode, type DateSelectorPreset } from './types';

/**
 * Same API as `DateSelector` but opens the calendar in a Dialog instead of a
 * Popover. Use this when the trigger lives inside another floating layer
 * (modal, drawer) where popovers would overflow or stack awkwardly.
 *
 * Slot, props, and emits mirror `DateSelector` so a caller can swap one for
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
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot name="trigger" :trigger-text="triggerText" />
    </DialogTrigger>
    <DialogContent
      custom-close
      :class="[
        // `overflow-hidden` makes DialogContent the scroll boundary; the inner
        // wrapper below establishes the actual scroll viewport so the
        // footer's `sticky bottom-0` resolves against a real scroll context
        // (without that, sticky walks up to the body and the footer drifts
        // into the calendar grid as the content grows).
        'flex max-h-[90vh] w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-4 md:max-w-2xl md:min-w-150',
        contentClassName,
      ]"
    >
      <VisuallyHidden>
        <DialogTitle>{{ t('common.dateSelector.currentMonth') }}</DialogTitle>
        <DialogDescription>{{ t('common.dateSelector.currentMonth') }}</DialogDescription>
      </VisuallyHidden>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <DateSelectorContent
          :period="modelValue"
          :presets="presets"
          :earliest-date="earliestDate"
          :allowed-filter-modes="allowedFilterModes"
          @apply="applyAndClose"
          @cancel="handleCancel"
          @preset-apply="applyAndClose"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
