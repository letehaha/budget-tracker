<!-- eslint-disable vuejs-accessibility/aria-role -->
<template>
  <!-- Reusable category list template -->
  <CategoryListTemplate>
    <div role="listbox">
      <template v-for="(item, index) in filteredItems" :key="item.id">
        <!-- Group separator (shown only when searching) -->
        <div
          v-if="shouldShowSeparator({ item, index })"
          class="text-muted-foreground flex items-center gap-2 px-2 pt-3 pb-1 text-xs font-medium"
          :class="{ 'pt-1': index === 0 }"
        >
          <span class="shrink-0">{{ item.rootParentName }}</span>
          <div class="bg-border h-px flex-1" />
        </div>

        <button
          class="text-popover-foreground hover:bg-popover-foreground/10 relative flex w-full cursor-pointer items-center gap-2 overflow-hidden border-none p-2 text-left text-sm leading-tight text-ellipsis transition-colors duration-300 ease-out"
          type="button"
          :class="{ 'bg-primary/15 hover:bg-primary/20': selectedValue?.id === item.id }"
          :style="{ paddingLeft: `${16 + (isSearching ? 0 : item.depth) * 12}px` }"
          role="option"
          :aria-selected="selectedValue?.id === item.id"
          @mousedown.prevent="selectItem(item)"
        >
          <CategoryCircle :category="item" />
          <span class="grow">{{ item.name }}</span>
        </button>
      </template>

      <div v-if="filteredItems.length === 0" class="text-muted-foreground p-4 text-center text-sm">
        {{ $t('fields.categorySelect.noCategoriesFound') }}
      </div>
    </div>
  </CategoryListTemplate>

  <div
    :class="{
      'category-select-field--disabled': disabled,
      'category-select-field--active': isOpen,
    }"
    class="relative w-full flex-1"
    data-test="category-select-field"
    role="select"
  >
    <FieldLabel :label="label" only-template>
      <!-- Desktop: Popover -->
      <template v-if="!isMobile">
        <Popover.Popover :open="isOpen" @update:open="(open: boolean) => (isOpen = open)">
          <Popover.PopoverTrigger as-child>
            <button
              type="button"
              :disabled="disabled"
              :class="
                cn(
                  'border-input bg-background ring-offset-background flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
                  disabled && 'cursor-not-allowed opacity-50',
                  $attrs.class ?? '',
                )
              "
              :aria-label="$t('fields.categorySelect.selectCategoryLabel')"
              :title="selectedValue?.name || $t('fields.categorySelect.selectCategoryLabel')"
            >
              <CategoryCircle v-if="selectedValue" :category="selectedValue" class="shrink-0" />
              <span
                class="text-muted-foreground min-w-0 flex-1 truncate text-left"
                :class="{ 'text-foreground': selectedValue }"
              >
                {{ selectedValue?.name || placeholder }}
              </span>
              <span
                v-if="selectedValue && !disabled"
                role="button"
                tabindex="0"
                class="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                :aria-label="$t('fields.categorySelect.clearSelectionLabel')"
                @click="clearSelection"
                @keydown.enter.prevent="clearSelection"
              >
                <XIcon class="size-4" />
              </span>
              <ChevronDownIcon
                class="text-popover-foreground size-5 shrink-0 transition-transform duration-150 ease-out"
                :class="{ 'rotate-180': isOpen }"
              />
            </button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent
            align="start"
            class="w-[--reka-popover-trigger-width] p-0"
            @open-auto-focus.prevent="$nextTick(() => inputRef?.focus())"
          >
            <!-- Search input -->
            <div class="border-b p-2">
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                class="bg-background w-full text-sm outline-none"
                :placeholder="$t('fields.categorySelect.searchPlaceholder')"
                :aria-label="$t('fields.categorySelect.searchCategoryLabel')"
              />
            </div>
            <!-- Category list -->
            <div ref="listRef" class="max-h-87.5 overflow-auto">
              <CategoryListContent />
            </div>
          </Popover.PopoverContent>
        </Popover.Popover>
      </template>

      <!-- Mobile: Button + Drawer -->
      <template v-else>
        <button
          type="button"
          :disabled="disabled"
          :class="
            cn(
              'border-input bg-background ring-offset-background flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden',
              disabled && 'cursor-not-allowed opacity-50',
              $attrs.class ?? '',
            )
          "
          :aria-label="$t('fields.categorySelect.selectCategoryLabel')"
          :title="selectedValue?.name || $t('fields.categorySelect.selectCategoryLabel')"
          @click="openDropdown"
        >
          <CategoryCircle v-if="selectedValue" :category="selectedValue" class="shrink-0" />
          <span
            class="text-muted-foreground min-w-0 flex-1 truncate text-left"
            :class="{ 'text-foreground': selectedValue }"
          >
            {{ selectedValue?.name || placeholder }}
          </span>
          <button
            v-if="selectedValue && !disabled"
            type="button"
            class="text-muted-foreground hover:text-foreground shrink-0"
            :aria-label="$t('fields.categorySelect.clearSelectionLabel')"
            @click="clearSelection"
          >
            <XIcon class="size-4" />
          </button>
          <ChevronDownIcon
            class="text-popover-foreground size-5 shrink-0 transition-transform duration-150 ease-out"
            :class="{ 'rotate-180': isOpen }"
          />
        </button>
      </template>
    </FieldLabel>

    <FieldError :error-message="errorMessage" />

    <!-- Mobile: Drawer -->
    <Drawer.Drawer v-if="isMobile" :open="isOpen" @update:open="handleDrawerOpenChange">
      <Drawer.DrawerContent class="px-4 pb-4">
        <Drawer.DrawerHeader class="px-0 pb-2">
          <Drawer.DrawerTitle>{{ $t('fields.categorySelect.selectCategoryLabel') }}</Drawer.DrawerTitle>
        </Drawer.DrawerHeader>

        <!-- Search input in drawer -->
        <div
          class="border-input bg-background mb-3 flex h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <input
            ref="drawerInputRef"
            v-model="searchQuery"
            type="text"
            class="min-w-0 flex-1 bg-transparent outline-none"
            :placeholder="selectedValue?.name || $t('fields.categorySelect.searchPlaceholder')"
            :aria-label="$t('fields.categorySelect.searchCategoryLabel')"
          />

          <button
            v-if="searchQuery.length"
            type="button"
            class="text-muted-foreground hover:text-foreground shrink-0"
            :aria-label="$t('fields.categorySelect.clearSearchLabel')"
            @click="searchQuery = ''"
          >
            <XIcon class="size-4" />
          </button>
        </div>

        <!-- Category list -->
        <div class="h-[50vh] overflow-auto">
          <CategoryListContent />
        </div>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  </div>
</template>

<script setup lang="ts">
import { type FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import { FieldError, FieldLabel } from '@/components/fields';
import * as Drawer from '@/components/lib/ui/drawer';
import * as Popover from '@/components/lib/ui/popover';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { cn } from '@/lib/utils';
import { CATEGORY_TYPES } from '@bt/shared/types';
import { createReusableTemplate } from '@vueuse/core';
import { ChevronDownIcon, XIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

defineOptions({ inheritAttrs: false });

const [CategoryListTemplate, CategoryListContent] = createReusableTemplate();

interface FlatCategory extends FormattedCategory {
  depth: number;
  rootParentId: number;
  rootParentName: string;
}

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue?: FormattedCategory | null;
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
  'update:model-value': [value: FormattedCategory | null];
}>();

const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiMobile);

const selectedValue = ref<FormattedCategory | null>(props.modelValue ?? null);
const inputRef = ref<HTMLInputElement | null>(null);
const drawerInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);
const searchQuery = ref('');
const isOpen = ref(false);

watch(
  () => props.modelValue,
  (value) => {
    if (value === null) {
      selectedValue.value = null;
    } else if (value && value.id !== selectedValue.value?.id) {
      selectedValue.value = value;
    }
  },
  { deep: true },
);

const flattenCategories = ({
  categories,
  depth = 0,
  rootParent,
}: {
  categories: FormattedCategory[];
  depth?: number;
  rootParent?: { id: number; name: string };
}): FlatCategory[] => {
  const result: FlatCategory[] = [];

  for (const category of categories) {
    const currentRoot = rootParent ?? { id: category.id, name: category.name };

    result.push({
      ...category,
      depth,
      rootParentId: currentRoot.id,
      rootParentName: currentRoot.name,
    });

    if (category.subCategories?.length > 0) {
      result.push(
        ...flattenCategories({
          categories: category.subCategories,
          depth: depth + 1,
          rootParent: currentRoot,
        }),
      );
    }
  }

  return result;
};

const allFlatCategories = computed(() => {
  // Sort root categories so internal ones are at the bottom
  const sortedValues = [...props.values].sort((a, b) => {
    if (a.type === CATEGORY_TYPES.internal && b.type !== CATEGORY_TYPES.internal) return 1;
    if (a.type !== CATEGORY_TYPES.internal && b.type === CATEGORY_TYPES.internal) return -1;
    return 0;
  });

  return flattenCategories({ categories: sortedValues });
});

const isSearching = computed(() => searchQuery.value.length > 0);

const filteredItems = computed(() => {
  if (!searchQuery.value) {
    return allFlatCategories.value;
  }

  const query = searchQuery.value.toLowerCase();
  return allFlatCategories.value.filter((category) => category.name.toLowerCase().includes(query));
});

const shouldShowSeparator = ({ item, index }: { item: FlatCategory; index: number }): boolean => {
  if (index === 0) return true;

  const prevItem = filteredItems.value[index - 1];
  return prevItem!.rootParentId !== item.rootParentId;
};

const openDropdown = () => {
  isOpen.value = true;
  searchQuery.value = '';
};

const handleDrawerOpenChange = (open: boolean) => {
  isOpen.value = open;
  if (!open) {
    searchQuery.value = '';
  }
};

const selectItem = (item: FlatCategory) => {
  selectedValue.value = item;
  emit('update:model-value', item);
  isOpen.value = false;
  searchQuery.value = '';
};

const clearSelection = (event: Event) => {
  event.stopPropagation();
  selectedValue.value = null;
  emit('update:model-value', null);
};

// Clear search query when popover closes
watch(isOpen, (value) => {
  if (!value) {
    searchQuery.value = '';
  }
});
</script>
