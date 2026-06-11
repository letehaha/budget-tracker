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
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: T | null];
}>();

const searchQuery = ref('');
const selectedValue = computed(() => props.modelValue);
const isDropdownOpen = ref<boolean>(false);
const debouncedFilteredValues = ref<T[]>(props.values);

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
      <FieldLabel :label="label" />
    </template>

    <div>
      <Select.Select v-model="selectedKey" :disabled="disabled" @update:open="isDropdownOpen = $event">
        <Select.SelectTrigger class="w-full">
          <Select.SelectValue :placeholder="placeholder ?? t('fields.select.selectOption')">
            {{ displayItem ? getLabelFromValue(displayItem) : (placeholder ?? t('fields.select.selectOption')) }}
          </Select.SelectValue>
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-if="withSearch || !!searchKeys" #header>
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
            v-for="item in debouncedFilteredValues"
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
