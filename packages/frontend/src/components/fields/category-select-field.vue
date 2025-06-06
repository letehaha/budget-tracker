<!-- eslint-disable vuejs-accessibility/aria-role -->
<template>
  <div
    :class="{
      'category-select-field--disabled': disabled,
      'category-select-field--active': isDropdownOpened,
    }"
    class="relative w-full flex-1"
    data-test="category-select-field"
    role="select"
  >
    <FieldLabel :label="label" only-template>
      <div class="relative">
        <button
          v-bind="$attrs"
          ref="buttonRef"
          :class="
            cn(
              'border-input bg-background ring-offset-background flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              $attrs.class ?? '',
            )
          "
          type="button"
          :disabled="disabled"
          aria-label="Select category"
          :title="selectedValue?.name || 'Select category'"
          @click="() => toggleDropdown()"
        >
          <template v-if="selectedValue">
            <CategoryCircle :category="selectedValue" />
          </template>

          {{ selectedValue?.name || placeholder }}

          <div class="category-select-field__arrow" />
        </button>

        <div
          v-if="isDropdownOpened"
          :class="
            cn(
              'bg-popover z-over-default invisible absolute left-0 top-full w-full rounded px-2 opacity-0 transition-all',
              isDropdownOpened && 'visible opacity-100',
            )
          "
        >
          <div ref="DOMList" class="max-h-[350px] overflow-auto" role="listbox">
            <!-- Show top parent category at the top of list of child categories -->
            <div class="category-select-field__search-field p-1 px-2">
              <input-field v-model="searchQuery" name="search" placeholder="Search..." autofocus />
            </div>
            <template v-if="previousLevelsIndices.length">
              <Button
                v-if="!searchQuery.length"
                type="button"
                variant="link"
                size="sm"
                class="group m-2 mt-0.5 flex items-center gap-1 border-none p-2 hover:no-underline"
                @click="backLevelUp"
              >
                <ChevronLeftIcon class="size-3 transition-transform group-hover:-translate-x-1" />
                Previous level
              </Button>

              <button
                v-if="!searchQuery.length"
                type="button"
                class="category-select-field__dropdown-item"
                :class="{
                  'category-select-field__dropdown-item--highlighed': selectedValue.id === topLevelCategory.id,
                }"
                role="option"
                :aria-selected="selectedValue.id === topLevelCategory.id"
                @click="selectItem(topLevelCategory, true)"
              >
                <CategoryCircle :category="topLevelCategory" />

                <span>
                  {{ topLevelCategory.name }}
                </span>
              </button>

              <h3 v-if="!searchQuery.length" class="text-popover-foreground mb-2 ml-4 mt-4 text-base font-medium">
                Subcategories
              </h3>
            </template>

            <!-- Show list of categories -->
            <template v-for="item in filteredItems" :key="item.id">
              <button
                class="category-select-field__dropdown-item"
                type="button"
                :class="{
                  'category-select-field__dropdown-item--highlighed': selectedValue.id === item.id,
                }"
                role="option"
                :aria-selected="selectedValue.id === item.id"
                @click="selectItem(item)"
              >
                <CategoryCircle :category="item" />

                <span>{{ item.name }}</span>

                <template v-if="item.subCategories.length && !searchQuery.length">
                  <div class="text-popover-foreground flex items-center gap-2">
                    <span>({{ item.subCategories.length }})</span>
                    <ChevronRightIcon class="size-3" />
                  </div>
                </template>
              </button>
            </template>

            <router-link
              to="/settings/categories"
              :class="
                buttonVariants({
                  size: 'sm',
                  variant: 'link',
                  class: 'my-4 w-full gap-2',
                })
              "
            >
              Create custom category

              <ExternalLinkIcon class="size-4" />
            </router-link>
          </div>
        </div>
      </div>
    </FieldLabel>

    <FieldError :error-message="errorMessage" />
  </div>
</template>

<script setup lang="ts">
import { type FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import { FieldError, FieldLabel, InputField } from '@/components/fields';
import { Button, buttonVariants } from '@/components/lib/ui/button';
import { cn } from '@/lib/utils';
import { CategoryModel } from '@bt/shared/types';
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from 'lucide-vue-next';
import { Ref, computed, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue: CategoryModel | null;
    labelKey?: string | ((value: FormattedCategory) => string);
    values: FormattedCategory[];
    placeholder?: string;
    errorMessage?: string;
    disabled?: boolean;
  }>(),
  {
    label: undefined,
    modelValue: undefined,
    placeholder: undefined,
    errorMessage: undefined,
    labelKey: 'label',
  },
);

const emit = defineEmits<{
  'update:model-value': [value: FormattedCategory];
}>();
const selectedValue = ref(props.modelValue || props.values[0]);
const buttonRef = ref<HTMLButtonElement>(null);

watch(
  () => props.modelValue,
  (value) => {
    // Sometimes real value comes with a delay, not immediately. We need to assign it to
    // selectedValue with a delay. Yet we need to avoid any risks of infinite loop, so we need to
    // compare IDs to only apply this when values differ
    if (value.id !== selectedValue.value.id) {
      selectedValue.value = value;
    }
  },
  { deep: true },
);

const levelValues = ref(props.values);

const rootCategories = ref(props.values);

const DOMList = ref<HTMLDivElement | null>(null);
const searchQuery = ref<string>('');

const isDropdownOpened = ref(false);
const previousLevelsIndices: Ref<number[]> = ref([]);

const topLevelCategory = computed<FormattedCategory>(() => {
  /**
   * If we are in a category's subcategories list, finds the subcategories
   * parent category to show it in the UI
   */
  let category;
  for (let i = 0; i < previousLevelsIndices.value.length; i++) {
    if (i === 0) {
      category = props.values[previousLevelsIndices.value[i]];
    } else {
      category = category.subCategories[previousLevelsIndices.value[i]];
    }
  }
  return category;
});

const toggleDropdown = (state?: boolean) => {
  isDropdownOpened.value = state ?? !isDropdownOpened.value;

  if (state === false) {
    buttonRef.value.focus();
  }
};

const filterCategories = (categories: FormattedCategory[], query: string): FormattedCategory[] => {
  let result: FormattedCategory[] = [];
  const lowerCaseQuery = query.toLowerCase();

  for (const category of categories) {
    if (category.name.toLowerCase().includes(lowerCaseQuery)) {
      result.push(category);
    }

    if (category.subCategories?.length > 0 && searchQuery.value.length) {
      const filteredSubCategories = filterCategories(category.subCategories, query);
      result = [...result, ...filteredSubCategories];
    }
  }

  return result;
};

const filteredItems = computed(() => {
  let category;
  if (previousLevelsIndices.value.length && searchQuery.value.length) {
    category = rootCategories.value;
  } else {
    category = levelValues.value;
  }
  return filterCategories(category, searchQuery.value);
});

const definePreviousLevelsIndices = (selectedItem: FormattedCategory) => {
  // push to `previousLevelsIndices` index of selecteItem so we will have
  // history of parent categories with which we can move through the history
  // of previous categories
  previousLevelsIndices.value.push(levelValues.value.findIndex((item) => item.id === selectedItem.id));
};

const selectItem = (item: FormattedCategory, ignorePreselect = false) => {
  /**
   * If item has child categories, it goes level deeper. `ignorePreselect`
   * will disable diving level deeper and will select category even if it
   * has child categories
   */
  if (item.subCategories.length && !ignorePreselect && !searchQuery.value.length) {
    definePreviousLevelsIndices(item);
    levelValues.value = item.subCategories;

    DOMList.value?.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    selectedValue.value = item;
    emit('update:model-value', item);
    toggleDropdown(false);
  }
  searchQuery.value = '';
};

const backLevelUp = () => {
  /**
   * Uses `previousLevelsIndices` to navigate through the history and make
   * previous level as the current one.
   *
   * At the end clears `previousLevelsIndices` by removing the last element
   * in the history.
   */
  let level: FormattedCategory[] = [];
  for (let i = 0; i < previousLevelsIndices.value.length; i++) {
    if (i === 0) {
      level = props.values;
    } else {
      level = level[previousLevelsIndices.value[i - 1]].subCategories;
    }
  }
  previousLevelsIndices.value.length -= 1;
  levelValues.value = level;
  searchQuery.value = '';
};

const handleEscPress = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopImmediatePropagation();
    toggleDropdown(false);
  }
};

watch(isDropdownOpened, (value) => {
  if (value) {
    document.addEventListener('keydown', handleEscPress, true);
  } else {
    document.removeEventListener('keydown', handleEscPress, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEscPress, true);
});
</script>

<style lang="scss" scoped>
.category-select-field__dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;

  transition: background-color 0.3s ease-out;
  border: none;
  background-color: rgb(var(--popover));
  font-size: 14px;
  line-height: 1.2;
  color: rgb(var(--popover-foreground));
  padding: 8px 16px;
  width: 100%;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  position: relative;

  span {
    flex-grow: 1;
  }

  &--highlighed {
    background-color: rgba(var(--popover-foreground), 0.05);
  }

  &:hover {
    background-color: rgba(var(--popover-foreground), 0.05);
  }
}
.category-select-field__arrow {
  position: absolute;
  width: 20px;
  height: 20px;
  top: calc(50% - 11px);
  right: 10px;

  &:after,
  &:before {
    content: '';
    position: absolute;
    width: 8px;
    height: 2px;
    background-color: rgb(var(--popover-foreground));
    border-radius: 2px;
    transform: rotate(-45deg);
    top: 10px;
    left: inherit;
    transition: transform 0.15s ease-out;
  }

  &:before {
    left: 5px;
    transform: rotate(45deg);
  }

  .category-select-field--active & {
    &:before {
      transform: rotate(-45deg);
    }
    &:after {
      transform: rotate(45deg);
    }
  }
}
</style>
