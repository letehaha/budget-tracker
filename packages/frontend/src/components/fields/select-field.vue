<script lang="ts" setup generic="T extends Record<string, any>">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { debounce } from 'lodash-es';
import { XIcon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import FieldError from './components/field-error.vue';
import FieldLabel from './components/field-label.vue';

const { t } = useI18n();

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
    withSearch?: boolean;
    searchKeys?: NonEmptyArray<StringOrNumberKeys<T>>;
    placeholder?: string;
    disabled?: boolean;
    /** Predicate to render an individual option as non-selectable. */
    optionDisabled?: (value: T) => boolean;
    errorMessage?: string;
    label?: string;
    /** When true and a value is selected, renders a clear button that emits update:modelValue with null. */
    clearable?: boolean;
    /** When true, appends a destructive asterisk to the label and sets aria-required on the trigger. */
    required?: boolean;
  }>(),
  {
    placeholder: undefined,
    disabled: false,
    withSearch: false,
    searchKeys: undefined,
    optionDisabled: undefined,
    errorMessage: undefined,
    labelKey: 'label',
    valueKey: 'value',
    label: undefined,
    clearable: false,
    required: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: T | null];
}>();

const searchQuery = ref('');
const selectedValue = computed(() => props.modelValue);
const debouncedFilteredValues = ref<T[]>(props.values);

// reka-ui's SelectContent renders its slot into a detached DocumentFragment
// even while the dropdown is closed (so the trigger can resolve item labels
// natively). With large `values` arrays every closed select pays the full
// mount cost of all SelectItems. The trigger label here is resolved manually
// via `displayItem`, so the hidden items are dead weight — defer rendering
// options (and the search header) until the dropdown opens for the first time.
const hasOpened = ref(false);

function onOpenChange(open: boolean) {
  if (open) hasOpened.value = true;
}

const renderedValues = computed(() => (hasOpened.value ? debouncedFilteredValues.value : []));

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

const selectedKey = computed({
  get: () => (selectedValue.value ? getKeyFromItem(selectedValue.value) : ''),
  set: (key: string) => {
    const newValue = props.values.find((item) => getKeyFromItem(item) === key) ?? null;
    searchQuery.value = '';
    emit('update:modelValue', newValue);
  },
});

// Look up the option from `values` by key instead of trusting `modelValue`,
// so labels stay fresh when the options array re-derives (i18n chunks load,
// async data resolves, locale switches). Falls back to `modelValue` if no
// match — preserves behavior for callers whose selection isn't in `values`.
const displayItem = computed<T | null>(() => {
  if (!selectedValue.value) return null;
  const key = getKeyFromItem(selectedValue.value);
  return props.values.find((item) => getKeyFromItem(item) === key) ?? selectedValue.value;
});

function handleClear(event: Event) {
  event.stopPropagation();
  emit('update:modelValue', null);
}

watch(
  searchQuery,
  debounce((query: string) => {
    const lowerCaseQuery = query.toLowerCase();
    debouncedFilteredValues.value = props.values.filter((item) => {
      if (props.searchKeys?.length) {
        // If keys are provided, disable filtering by the label
        return props.searchKeys.some((key) => String(item[key]).toLowerCase().includes(lowerCaseQuery));
      }
      return getLabelFromValue(item).toLowerCase().includes(lowerCaseQuery);
    });
  }, 300),
);

// Sync filtered values when props.values changes (e.g., async-loaded data)
watch(
  () => props.values,
  (newValues) => {
    if (!searchQuery.value) {
      debouncedFilteredValues.value = newValues;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <template v-if="label">
      <FieldLabel :label="label">
        <template v-if="required" #label-after>
          <span class="text-destructive-text" aria-hidden="true">*</span>
        </template>
      </FieldLabel>
    </template>

    <div>
      <Select.Select v-model="selectedKey" :disabled="disabled" @update:open="onOpenChange">
        <Select.SelectTrigger class="w-full" :aria-required="required || undefined">
          <Select.SelectValue :placeholder="placeholder ?? t('fields.select.selectOption')">
            {{ displayItem ? getLabelFromValue(displayItem) : (placeholder ?? t('fields.select.selectOption')) }}
          </Select.SelectValue>
          <!-- Clear button precedes SelectTrigger's built-in chevron; ml-auto pins it
               to the right edge so a long label still truncates instead of colliding. -->
          <button
            v-if="clearable && displayItem"
            type="button"
            :aria-label="t('components.selectField.clearSelection')"
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring mr-1 ml-auto shrink-0 rounded focus:outline-none focus-visible:ring-1"
            @click="handleClear"
            @keydown.enter.stop="handleClear"
            @keydown.space.stop="handleClear"
          >
            <XIcon class="size-3.5" />
          </button>
        </Select.SelectTrigger>

        <Select.SelectContent>
          <template v-if="hasOpened && (withSearch || !!searchKeys)" #header>
            <div class="border-border border-b p-2">
              <input-field
                v-model="searchQuery"
                type="text"
                :placeholder="t('fields.select.searchPlaceholder')"
                trailing-icon-css-class="px-0"
                @keydown.stop
              >
                <template #iconTrailing>
                  <template v-if="searchQuery">
                    <Button variant="ghost" size="icon" @click="searchQuery = ''">
                      <XIcon class="size-4" />
                    </Button>
                  </template>
                </template>
              </input-field>
            </div>
          </template>

          <Select.SelectItem
            v-for="item in renderedValues"
            :key="getKeyFromItem(item as T)"
            :value="getKeyFromItem(item as T)"
            :disabled="optionDisabled ? optionDisabled(item as T) : undefined"
          >
            <slot name="item" :item="item" :label="getLabelFromValue(item as T)">
              {{ getLabelFromValue(item as T) }}
            </slot>
          </Select.SelectItem>

          <slot name="select-bottom-content" />
        </Select.SelectContent>
      </Select.Select>
    </div>

    <FieldError :error-message="errorMessage" />
  </div>
</template>
