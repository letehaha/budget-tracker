<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger
      class="border-input bg-background ring-offset-background focus-visible:ring-ring flex w-full items-center gap-2 overflow-hidden rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span
          class="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-2 text-sm font-medium"
        >
          {{ isAllSelected ? totalCategoryCount : selectedCategoryCount }}
        </span>
        <span class="min-w-0 flex-1 truncate text-left font-medium">
          {{
            isAllSelected
              ? $t('fields.comboboxCategories.unselectedPlaceholder')
              : selectedCategoryCount === 1
                ? $t('fields.comboboxCategories.category')
                : $t('fields.comboboxCategories.categoriesSelected')
          }}
        </span>
      </div>

      <template v-if="!isAllSelected">
        <Button variant="ghost" size="icon" class="size-6 shrink-0" @click.stop="clearSelection">
          <XIcon class="text-muted-foreground size-4" />
        </Button>
      </template>
      <template v-else>
        <div class="size-6 shrink-0 p-1">
          <ChevronDownIcon class="text-muted-foreground size-4" />
        </div>
      </template>
    </Popover.PopoverTrigger>

    <Popover.PopoverContent
      class="w-(--reka-popover-trigger-width) min-w-75 rounded-md p-0"
      :side="dropdownSide"
      :avoid-collisions="false"
      align="start"
      :side-offset="4"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <input
          v-model="searchTerm"
          type="text"
          class="border-input bg-background h-9 w-full rounded-md border pl-9 text-sm outline-none"
          :placeholder="$t('fields.comboboxCategories.searchPlaceholder')"
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>

      <div :class="['max-h-85 overflow-y-auto p-1.25 lg:max-h-60', { 'select-none': isShiftPressed }]">
        <p v-if="displayedItems.length === 0" class="text-muted-foreground py-2 text-center text-xs font-medium">
          {{ $t('fields.categoryMultiSelect.noCategoriesFound') }}
        </p>

        <template v-for="(item, index) in displayedItems" :key="item.id">
          <!-- Group separator (shown only when searching and root changes) -->
          <div
            v-if="shouldShowSeparator({ item, index })"
            class="text-muted-foreground flex items-center gap-2 px-2 pt-3 pb-1 text-xs font-medium"
            :class="{ 'pt-1': index === 0 }"
          >
            <span class="shrink-0">{{ item.rootParentName }}</span>
            <div class="bg-border h-px flex-1" />
          </div>

          <button
            type="button"
            class="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left"
            :class="{ 'bg-primary/5': isCategoryChecked(item) === true }"
            :style="{ paddingLeft: `${8 + (isSearching ? 0 : item.depth) * 16}px` }"
            @mousedown.prevent
            @click="handleToggle({ item, index })"
          >
            <Checkbox :model-value="isCategoryChecked(item)" class="pointer-events-none size-3.5" tabindex="-1">
              <MinusIcon v-if="isCategoryChecked(item) === 'indeterminate'" class="size-3" />
              <CheckIcon v-else class="size-3" />
            </Checkbox>
            <CategoryCircle :category="item" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>
            <span v-if="!isSearching && item.descendantIds.length > 0" class="text-muted-foreground text-xs">
              {{ item.descendantIds.length }}
            </span>
          </button>
        </template>
      </div>
    </Popover.PopoverContent>
  </Popover.Popover>
</template>

<script setup lang="ts">
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import * as Popover from '@/components/lib/ui/popover';
import { CUSTOM_BREAKPOINTS, useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useCategoriesStore } from '@/stores';
import { CheckIcon, ChevronDownIcon, MinusIcon, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  type FlatCategory,
  computeCheckedState,
  computeSessionRootOrder,
  flattenCategories,
  sortInternalLast,
  toggleCategorySelection,
} from './combobox-categories.helpers';

const props = defineProps<{
  categoryIds: number[];
}>();

const emit = defineEmits<{
  'update:categoryIds': [value: number[]];
}>();

const { formattedCategories } = storeToRefs(useCategoriesStore());

const searchTerm = ref('');
const isOpen = ref(false);

const isMobile = useWindowBreakpoints(CUSTOM_BREAKPOINTS.uiDesktop);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

const selectedIdsSet = computed(() => new Set(props.categoryIds));

const baseOrderedCategories = computed(() =>
  flattenCategories({ categories: sortInternalLast(formattedCategories.value) }),
);

const sessionRootOrder = ref<number[]>([]);

watch(isOpen, (open) => {
  if (!open) {
    searchTerm.value = '';
    lastClickedIndex = null;
    return;
  }

  sessionRootOrder.value = computeSessionRootOrder({
    roots: formattedCategories.value,
    selectedIds: selectedIdsSet.value,
  });
});

const orderedFlatCategories = computed<FlatCategory[]>(() => {
  if (!isOpen.value || !sessionRootOrder.value.length) {
    return baseOrderedCategories.value;
  }

  const byRoot = new Map<number, FlatCategory[]>();
  for (const item of baseOrderedCategories.value) {
    const group = byRoot.get(item.rootParentId) ?? [];
    group.push(item);
    byRoot.set(item.rootParentId, group);
  }

  const result: FlatCategory[] = [];
  for (const rootId of sessionRootOrder.value) {
    const group = byRoot.get(rootId);
    if (group) result.push(...group);
  }
  return result;
});

const isSearching = computed(() => searchTerm.value.trim().length > 0);

const displayedItems = computed(() => {
  if (!isSearching.value) return orderedFlatCategories.value;
  const term = searchTerm.value.trim().toLowerCase();
  return orderedFlatCategories.value.filter((item) => item.name.toLowerCase().includes(term));
});

const shouldShowSeparator = ({ item, index }: { item: FlatCategory; index: number }): boolean => {
  if (!isSearching.value) return false;
  if (index === 0) return true;
  const prev = displayedItems.value[index - 1];
  return prev?.rootParentId !== item.rootParentId;
};

const isCategoryChecked = (item: FlatCategory) =>
  computeCheckedState({ item, selectedIds: selectedIdsSet.value, isSearching: isSearching.value });

// Shift-click range selection
const isShiftPressed = ref(false);
let lastClickedIndex: number | null = null;

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Shift') isShiftPressed.value = true;
};

const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Shift') isShiftPressed.value = false;
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});

const handleToggle = ({ item, index }: { item: FlatCategory; index: number }) => {
  const next = toggleCategorySelection({
    item,
    clickedIndex: index,
    currentSelection: props.categoryIds,
    displayedItems: displayedItems.value,
    isSearching: isSearching.value,
    isShiftPressed: isShiftPressed.value,
    lastClickedIndex,
  });

  lastClickedIndex = index;
  emit('update:categoryIds', next);
};

const totalCategoryCount = computed(() => baseOrderedCategories.value.length);

const selectedCategoryCount = computed(() => props.categoryIds.length);

const isAllSelected = computed(() => props.categoryIds.length === 0);

const clearSelection = () => {
  lastClickedIndex = null;
  emit('update:categoryIds', []);
};
</script>
