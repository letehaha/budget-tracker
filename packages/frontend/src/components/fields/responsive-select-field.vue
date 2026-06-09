<script lang="ts" setup generic="T extends Record<string, any>">
import * as Drawer from '@/components/lib/ui/drawer';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { createReusableTemplate } from '@vueuse/core';
import { ChevronDownIcon, SearchIcon, XIcon } from '@lucide/vue';
import { debounce } from 'lodash-es';
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import FieldError from './components/field-error.vue';
import FieldLabel from './components/field-label.vue';

type StringOrNumberKeys<T> = {
  [P in keyof T]: T[P] extends string | number ? P : never;
}[keyof T];
type NonEmptyArray<T> = [T, ...T[]];

const props = withDefaults(
  defineProps<{
    modelValue: T | null;
    values: T[];
    labelKey?: keyof T | ((value: T) => string) | 'label';
    valueKey?: keyof T | ((value: T) => string | number) | 'value';
    searchKeys?: NonEmptyArray<StringOrNumberKeys<T>>;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    /** Predicate to render an individual option as non-selectable. */
    optionDisabled?: (value: T) => boolean;
    errorMessage?: string;
    /** Drawer title on mobile / aria label on desktop. Falls back to placeholder/i18n default. */
    title?: string;
  }>(),
  {
    placeholder: undefined,
    label: undefined,
    disabled: false,
    searchKeys: undefined,
    optionDisabled: undefined,
    errorMessage: undefined,
    title: undefined,
    labelKey: 'label',
    valueKey: 'value',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: T | null];
}>();

const { t } = useI18n();
const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const isOpen = ref(false);
const searchQuery = ref('');
const debouncedFilteredValues = ref<T[]>(props.values);
const searchInputRef = ref<HTMLInputElement | null>(null);

const getLabelFromValue = (value: T): string => {
  const { labelKey } = props;
  if (typeof labelKey === 'function') return labelKey(value);
  return String(value[labelKey as keyof T]);
};

const getValueFromItem = (item: T): string | number => {
  const { valueKey } = props;
  if (typeof valueKey === 'function') return valueKey(item);
  return item[valueKey as keyof T] as string | number;
};
const getKeyFromItem = (item: T): string => String(getValueFromItem(item));

const selectedKey = computed(() => (props.modelValue ? getKeyFromItem(props.modelValue) : ''));

// Resolve display label from `values` (not `modelValue`) so labels stay fresh
// when the options array re-derives (i18n chunks load, async data resolves,
// locale switches). Falls back to `modelValue` if no match.
const displayItem = computed<T | null>(() => {
  if (!props.modelValue) return null;
  const key = getKeyFromItem(props.modelValue);
  return props.values.find((item) => getKeyFromItem(item) === key) ?? props.modelValue;
});

const displayLabel = computed(() => (displayItem.value ? getLabelFromValue(displayItem.value) : ''));

const placeholderResolved = computed(() => props.placeholder ?? t('fields.select.selectOption'));
const drawerTitleResolved = computed(() => props.title ?? props.label ?? placeholderResolved.value);

const applyFilter = (query: string) => {
  const lowerCaseQuery = query.toLowerCase();
  debouncedFilteredValues.value = props.values.filter((item) => {
    if (props.searchKeys?.length) {
      return props.searchKeys.some((key) => String(item[key]).toLowerCase().includes(lowerCaseQuery));
    }
    return getLabelFromValue(item).toLowerCase().includes(lowerCaseQuery);
  });
};

watch(searchQuery, debounce(applyFilter, 300));

// Re-filter immediately (not debounced) when the options re-derive — async
// data resolving or locale switches must not leave a stale list, even while
// a search query is active.
watch(
  () => props.values,
  () => applyFilter(searchQuery.value),
  { immediate: true },
);

const selectItem = (item: T) => {
  if (props.optionDisabled?.(item)) return;
  emit('update:modelValue', item);
  isOpen.value = false;
  searchQuery.value = '';
};

const handleOpenChange = (open: boolean) => {
  isOpen.value = open;
  if (!open) {
    searchQuery.value = '';
    return;
  }
  if (isMobile.value) {
    // Blur the trigger so it doesn't retain focus inside the aria-hidden
    // outer drawer/dialog (WAI-ARIA disallows focus under aria-hidden).
    // Deliberately do NOT focus the search input here — that would pop the
    // soft keyboard over the freshly opened drawer and hide the option list.
    (document.activeElement as HTMLElement | null)?.blur?.();
  } else {
    nextTick(() => searchInputRef.value?.focus());
  }
};

const triggerClass = computed(() =>
  cn(
    'border-input bg-input-background ring-offset-background flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
    props.disabled && 'cursor-not-allowed opacity-50',
  ),
);

const [PickerContent, RenderPickerContent] = createReusableTemplate();
</script>

<template>
  <FieldLabel :label="label" only-template>
    <PickerContent>
      <div class="border-input border-b p-2">
        <div class="relative">
          <SearchIcon class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="border-input bg-input-background h-9 w-full rounded-md border pr-2 pl-8 text-sm focus:outline-none"
            :placeholder="t('fields.select.searchPlaceholder')"
            @keydown.stop
          />
          <button
            v-if="searchQuery"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            :aria-label="t('common.actions.clear')"
            @click="searchQuery = ''"
          >
            <XIcon class="size-4" />
          </button>
        </div>
      </div>

      <!-- max-h must sit on the viewport: the root's height is auto, so the
           viewport's h-full resolves to content height and a root-level max-h
           would only clip without enabling scroll. -->
      <ScrollArea :viewport-class="isMobile ? 'max-h-[60vh]' : 'max-h-72'">
        <div role="listbox">
          <button
            v-for="item in debouncedFilteredValues"
            :key="getKeyFromItem(item as T)"
            type="button"
            role="option"
            :aria-selected="selectedKey === getKeyFromItem(item as T)"
            :disabled="optionDisabled ? optionDisabled(item as T) : undefined"
            class="hover:bg-popover-foreground/10 flex w-full items-center gap-2 border-none p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 md:p-2"
            :class="{ 'bg-primary/15 hover:bg-primary/20': selectedKey === getKeyFromItem(item as T) }"
            @click="selectItem(item as T)"
          >
            <slot name="item" :item="item as T" :label="getLabelFromValue(item as T)">
              <span class="min-w-0 grow truncate">{{ getLabelFromValue(item as T) }}</span>
            </slot>
          </button>

          <div v-if="debouncedFilteredValues.length === 0" class="text-muted-foreground p-4 text-center text-sm">
            {{ $t('fields.select.noResults') }}
          </div>
        </div>
      </ScrollArea>

      <slot name="select-bottom-content" />
    </PickerContent>

    <!-- Desktop: Popover -->
    <template v-if="!isMobile">
      <Popover.Popover :open="isOpen" @update:open="handleOpenChange">
        <Popover.PopoverTrigger as-child>
          <button type="button" :disabled="disabled" :class="triggerClass" :aria-label="drawerTitleResolved">
            <span
              class="text-muted-foreground min-w-0 flex-1 truncate text-left"
              :class="{ 'text-foreground': displayLabel }"
            >
              {{ displayLabel || placeholderResolved }}
            </span>
            <ChevronDownIcon
              class="text-popover-foreground size-5 shrink-0 transition-transform duration-150 ease-out"
              :class="{ 'rotate-180': isOpen }"
            />
          </button>
        </Popover.PopoverTrigger>

        <Popover.PopoverContent
          align="start"
          class="w-(--reka-popover-trigger-width) max-w-(--reka-popover-trigger-width) min-w-(--reka-popover-trigger-width) p-0"
        >
          <RenderPickerContent />
        </Popover.PopoverContent>
      </Popover.Popover>
    </template>

    <!-- Mobile: Drawer -->
    <template v-else>
      <button
        type="button"
        :disabled="disabled"
        :class="triggerClass"
        :aria-label="drawerTitleResolved"
        @click="handleOpenChange(true)"
      >
        <span
          class="text-muted-foreground min-w-0 flex-1 truncate text-left"
          :class="{ 'text-foreground': displayLabel }"
        >
          {{ displayLabel || placeholderResolved }}
        </span>
        <ChevronDownIcon
          class="text-popover-foreground size-5 shrink-0 transition-transform duration-150 ease-out"
          :class="{ 'rotate-180': isOpen }"
        />
      </button>

      <Drawer.Drawer :open="isOpen" @update:open="handleOpenChange">
        <Drawer.DrawerContent class="px-0 pb-4">
          <Drawer.DrawerHeader class="px-4 pt-2 pb-2 text-center">
            <Drawer.DrawerTitle>{{ drawerTitleResolved }}</Drawer.DrawerTitle>
            <Drawer.DrawerDescription class="sr-only">{{ drawerTitleResolved }}</Drawer.DrawerDescription>
          </Drawer.DrawerHeader>

          <RenderPickerContent />
        </Drawer.DrawerContent>
      </Drawer.Drawer>
    </template>

    <FieldError :error-message="errorMessage" />
  </FieldLabel>
</template>
