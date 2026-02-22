<script lang="ts" setup>
import { useDateLocale } from '@/composable/use-date-locale';
import { type Period } from '@/composable/use-period-navigation';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { createReusableTemplate } from '@vueuse/core';
import { isSameMonth } from 'date-fns';
import { VisuallyHidden } from 'reka-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '../drawer';
import Popover from '../popover/Popover.vue';
import PopoverContent from '../popover/PopoverContent.vue';
import PopoverTrigger from '../popover/PopoverTrigger.vue';
import DateSelectorContent from './date-selector-content.vue';
import { type DateSelectorPreset } from './types';

const [UseTemplate, SlotContent] = createReusableTemplate();

const props = withDefaults(
  defineProps<{
    modelValue: Period;
    presets?: DateSelectorPreset[];
    earliestDate?: Date;
    popoverClassName?: string;
  }>(),
  {
    presets: undefined,
    earliestDate: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: Period];
}>();

const { t } = useI18n();
const { format } = useDateLocale();

const isOpen = ref(false);
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

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
  <UseTemplate>
    <DateSelectorContent
      :period="modelValue"
      :presets="presets"
      :earliest-date="earliestDate"
      @apply="applyAndClose"
      @cancel="handleCancel"
      @preset-apply="applyAndClose"
    />
  </UseTemplate>

  <!-- Mobile: Drawer -->
  <template v-if="isMobile">
    <Drawer v-model:open="isOpen">
      <DrawerTrigger as-child>
        <slot name="trigger" :trigger-text="triggerText" />
      </DrawerTrigger>
      <DrawerContent class="px-4 pb-4">
        <VisuallyHidden>
          <DrawerTitle>{{ t('common.dateSelector.currentMonth') }}</DrawerTitle>
          <DrawerDescription>{{ t('common.dateSelector.currentMonth') }}</DrawerDescription>
        </VisuallyHidden>
        <div class="min-h-0 flex-1 overflow-y-auto pt-4">
          <SlotContent />
        </div>
      </DrawerContent>
    </Drawer>
  </template>

  <!-- Desktop: Popover -->
  <template v-else>
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <slot name="trigger" :trigger-text="triggerText" />
      </PopoverTrigger>
      <PopoverContent
        :class="cn(['w-auto max-w-[calc(100vw-1rem)] p-4', popoverClassName])"
        align="center"
        side="top"
        :side-offset="8"
      >
        <SlotContent />
      </PopoverContent>
    </Popover>
  </template>
</template>
