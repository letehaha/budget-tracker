<script lang="ts" setup generic="T extends Record<string, any>">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { debounce } from 'lodash-es';
import { XIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

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
    withSearch?: boolean;
    searchKeys?: NonEmptyArray<StringOrNumberKeys<T>>;
    placeholder?: string;
    disabled?: boolean;
    errorMessage?: string;
    label?: string;
  }>(),
  {
    placeholder: 'Select an option',
    disabled: false,
    withSearch: false,
    searchKeys: undefined,
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
</script>

<template>
  <div>
    <template v-if="label">
      <FieldLabel :label="label" />
    </template>

    <div>
      <Select.Select v-model="selectedKey" :disabled="disabled" @update:open="isDropdownOpen = $event">
        <Select.SelectTrigger class="w-full">
          <Select.SelectValue :placeholder="placeholder">
            {{ selectedValue ? getLabelFromValue(selectedValue) : placeholder }}
          </Select.SelectValue>
        </Select.SelectTrigger>
        <Select.SelectContent>
          <template v-if="withSearch || !!searchKeys">
            <div class="p-2">
              <input-field
                v-model="searchQuery"
                type="text"
                placeholder="Search..."
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
          >
            {{ getLabelFromValue(item as T) }}
          </Select.SelectItem>

          <slot name="select-bottom-content" />
        </Select.SelectContent>
      </Select.Select>
    </div>

    <FieldError :error-message="errorMessage" />
  </div>
</template>
