<template>
  <Popover v-model:open="isPopoverOpen">
    <PopoverTrigger as-child>
      <Button size="icon-sm" variant="ghost">
        <SettingsIcon class="text-muted-foreground size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-52 p-1" align="end">
      <button
        type="button"
        class="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
        @click="openDialog"
      >
        <CircleOffIcon class="text-muted-foreground size-4" />
        {{ $t('dashboard.widgets.expensesStructure.excludeSettings.excludeCategories') }}
      </button>
    </PopoverContent>
  </Popover>

  <ResponsiveDialog v-model:open="isDialogOpen" dialog-content-class="max-h-[85vh]">
    <template #title>
      {{ $t('dashboard.widgets.expensesStructure.excludeSettings.dialogTitle') }}
    </template>
    <template #description>
      {{ $t('dashboard.widgets.expensesStructure.excludeSettings.dialogDescription') }}
    </template>

    <!-- Search -->
    <div class="border-input mb-4 flex items-center gap-2 rounded-md border px-3 py-2">
      <SearchIcon class="text-muted-foreground size-4 shrink-0" />
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        class="bg-background min-w-0 flex-1 text-sm outline-none"
        :placeholder="$t('fields.categorySelect.searchPlaceholder')"
      />
      <button
        v-if="searchQuery.length"
        class="text-muted-foreground hover:text-foreground shrink-0"
        @click="searchQuery = ''"
      >
        <XIcon class="size-4" />
      </button>
    </div>

    <!-- Category list -->
    <div class="max-h-100 overflow-y-auto">
      <template v-for="(item, index) in filteredItems" :key="item.id">
        <!-- Group separator when searching -->
        <div
          v-if="shouldShowSeparator({ item, index })"
          class="text-muted-foreground flex items-center gap-2 px-2 pt-3 pb-1 text-xs font-medium"
          :class="{ 'pt-1': index === 0 }"
        >
          <span class="shrink-0">{{ item.rootParentName }}</span>
          <div class="bg-border h-px flex-1" />
        </div>

        <label
          class="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          :style="{ paddingLeft: `${8 + (isSearching ? 0 : item.depth) * 12}px` }"
        >
          <Checkbox
            :model-value="localExcluded.has(item.id)"
            @update:model-value="toggleCategory({ categoryId: item.id })"
          />
          <CategoryCircle :category="item" />
          <span class="min-w-0 truncate">{{ item.name }}</span>
        </label>
      </template>

      <div v-if="filteredItems.length === 0" class="text-muted-foreground p-4 text-center text-sm">
        {{ $t('fields.categorySelect.noCategoriesFound') }}
      </div>
    </div>

    <template #footer>
      <Button class="w-full" @click="save">
        {{ $t('dashboard.widgets.expensesStructure.excludeSettings.save') }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>

<script lang="ts" setup>
import type { FormattedCategory } from '@/common/types';
import CategoryCircle from '@/components/common/category-circle.vue';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/lib/ui/popover';
import { useCategoriesStore } from '@/stores';
import { CATEGORY_TYPES } from '@bt/shared/types';
import { CircleOffIcon, SearchIcon, SettingsIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  excludedCategoryIds: number[];
}>();

const emit = defineEmits<{
  save: [payload: { categoryIds: number[] }];
}>();

const { formattedCategories, categories } = storeToRefs(useCategoriesStore());

const isPopoverOpen = ref(false);
const isDialogOpen = ref(false);
const localExcluded = ref(new Set<number>());
const searchQuery = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(isDialogOpen, (open) => {
  if (open) {
    localExcluded.value = new Set(props.excludedCategoryIds);
    searchQuery.value = '';
    nextTick(() => inputRef.value?.focus());
  }
});

const openDialog = () => {
  isPopoverOpen.value = false;
  isDialogOpen.value = true;
};

// --- Flat category list (same approach as category-picker-dialog) ---

interface FlatCategory extends FormattedCategory {
  depth: number;
  rootParentId: number;
  rootParentName: string;
}

const flattenCategories = ({
  items,
  depth = 0,
  rootParent,
}: {
  items: FormattedCategory[];
  depth?: number;
  rootParent?: { id: number; name: string };
}): FlatCategory[] => {
  const result: FlatCategory[] = [];

  for (const category of items) {
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
          items: category.subCategories,
          depth: depth + 1,
          rootParent: currentRoot,
        }),
      );
    }
  }

  return result;
};

const allFlatCategories = computed(() => {
  const sorted = [...formattedCategories.value].sort((a, b) => {
    if (a.type === CATEGORY_TYPES.internal && b.type !== CATEGORY_TYPES.internal) return 1;
    if (a.type !== CATEGORY_TYPES.internal && b.type === CATEGORY_TYPES.internal) return -1;
    return 0;
  });

  return flattenCategories({ items: sorted });
});

const isSearching = computed(() => searchQuery.value.length > 0);

const filteredItems = computed(() => {
  if (!searchQuery.value) return allFlatCategories.value;

  const query = searchQuery.value.toLowerCase();
  return allFlatCategories.value.filter((category) => category.name.toLowerCase().includes(query));
});

const shouldShowSeparator = ({ item, index }: { item: FlatCategory; index: number }): boolean => {
  if (!isSearching.value) return false;
  if (index === 0) return true;
  return filteredItems.value[index - 1]!.rootParentId !== item.rootParentId;
};

// --- Category tree helpers for descendant lookups ---

const childrenMap = computed(() => {
  const map = new Map<number, number[]>();
  for (const cat of categories.value) {
    if (cat.parentId !== null) {
      const children = map.get(cat.parentId) ?? [];
      children.push(cat.id);
      map.set(cat.parentId, children);
    }
  }
  return map;
});

const getDescendantIds = ({ categoryId }: { categoryId: number }): number[] => {
  const result: number[] = [];
  const queue = [...(childrenMap.value.get(categoryId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    queue.push(...(childrenMap.value.get(current) ?? []));
  }
  return result;
};

const toggleCategory = ({ categoryId }: { categoryId: number }) => {
  const next = new Set(localExcluded.value);
  const wasChecked = next.has(categoryId);
  const descendants = getDescendantIds({ categoryId });

  if (wasChecked) {
    next.delete(categoryId);
    for (const id of descendants) next.delete(id);
  } else {
    next.add(categoryId);
    for (const id of descendants) next.add(id);
  }

  localExcluded.value = next;
};

const save = () => {
  emit('save', { categoryIds: [...localExcluded.value] });
  isDialogOpen.value = false;
};
</script>
