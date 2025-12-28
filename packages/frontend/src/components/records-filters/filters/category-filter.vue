<template>
  <Combobox.Combobox
    :model-value="undefined"
    v-model:searchTerm="searchTerm"
    v-model:open="isOpen"
    :multiple="true"
    class="w-full"
  >
    <Combobox.ComboboxAnchor>
      <Combobox.ComboboxTrigger
        class="ring-offset-background focus-visible:ring-ring flex w-full justify-between rounded-md text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-sm font-medium"
          >
            {{ isAllSelected ? categoriesCount : selectedCategoryIds.length }}
          </span>
          <span class="font-medium">
            {{
              isAllSelected
                ? 'All categories'
                : `${selectedCategoryIds.length === 1 ? 'category' : 'categories'} selected`
            }}
          </span>
        </div>

        <template v-if="!isAllSelected && selectedCategoryIds.length > 0">
          <Button variant="ghost" size="icon" class="size-6" @click.stop="clearSelection">
            <XIcon class="text-muted-foreground size-4" />
          </Button>
        </template>
        <template v-else>
          <div class="size-6 p-1">
            <ChevronDown class="text-muted-foreground size-4" />
          </div>
        </template>
      </Combobox.ComboboxTrigger>
    </Combobox.ComboboxAnchor>

    <Combobox.ComboboxList
      class="max-h-[400px] w-[var(--reka-combobox-trigger-width)] lg:max-h-[300px]"
      :side="dropdownSide"
      :avoid-collisions="false"
    >
      <div class="relative w-full items-center p-2 pb-0">
        <Combobox.ComboboxInput
          class="h-9 w-full rounded-md border pl-9 focus-visible:ring-0"
          placeholder="Search categories..."
        />
        <SearchIcon class="text-muted-foreground absolute top-[60%] left-4 size-5 -translate-y-1/2" />
      </div>
      <div class="max-h-[340px] overflow-y-auto p-[5px] lg:max-h-[240px]">
        <Combobox.ComboboxEmpty class="text-mauve8 py-2 text-center text-xs font-medium" />

        <Combobox.ComboboxGroup>
          <Combobox.ComboboxItem
            v-for="category in displayedCategories"
            :key="category.id"
            :value="category"
            class="hover:bg-accent hover:text-accent-foreground flex-start flex cursor-pointer items-center justify-between rounded-md px-2 py-1"
            @select.prevent="pickCategory(category)"
          >
            <div class="flex items-center gap-2">
              <CategoryCircle :category="category" />
              <span>{{ category.name }}</span>
            </div>
            <CheckIcon v-if="isCategorySelected(category.id)" />
          </Combobox.ComboboxItem>
        </Combobox.ComboboxGroup>
      </div>
    </Combobox.ComboboxList>
  </Combobox.Combobox>
</template>

<script setup lang="ts">
import CategoryCircle from '@/components/common/category-circle.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Combobox from '@/components/lib/ui/combobox';
import { useWindowBreakpoints } from '@/composable/window-breakpoints';
import { useCategoriesStore } from '@/stores';
import { CategoryModel } from '@bt/shared/types';
import { isEqual } from 'lodash-es';
import { CheckIcon, ChevronDown, SearchIcon, XIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  categoryIds: number[];
}>();

const emit = defineEmits<{
  'update:categoryIds': [value: number[]];
}>();

const searchTerm = ref('');
const isOpen = ref(false);

const { categories } = storeToRefs(useCategoriesStore());

const isMobile = useWindowBreakpoints(1024);
const dropdownSide = computed(() => (isMobile.value ? 'top' : 'bottom'));

const categoriesCount = computed(() => categories.value.length);

const selectedCategoryIds = ref<number[]>([]);

// Sync internal state when props change (and differ from current state)
watch(
  () => props.categoryIds,
  (newIds) => {
    // Only sync if values actually differ (prevents loops)
    if (isEqual([...newIds].sort(), [...selectedCategoryIds.value].sort())) return;

    selectedCategoryIds.value = [...newIds];
  },
  { immediate: true },
);

const isAllSelected = computed(() => selectedCategoryIds.value.length === 0);

const baseSortedCategories = computed(() => {
  const cats = [...categories.value];
  const byId = new Map(cats.map((c) => [c.id, c]));

  // Build parent chain for sorting: returns [rootName, childName, grandchildName, ...]
  const getNameChain = (cat: CategoryModel): string[] => {
    const chain: string[] = [];
    let current: CategoryModel | undefined = cat;
    while (current) {
      chain.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  };

  return cats.sort((a, b) => {
    const chainA = getNameChain(a);
    const chainB = getNameChain(b);

    // Compare each level of the hierarchy
    for (let i = 0; i < Math.max(chainA.length, chainB.length); i++) {
      const nameA = chainA[i] ?? '';
      const nameB = chainB[i] ?? '';
      if (nameA !== nameB) {
        // Parent comes before its children (shorter chain first if same prefix)
        if (i >= chainA.length) return -1;
        if (i >= chainB.length) return 1;
        return nameA.localeCompare(nameB);
      }
    }
    return 0;
  });
});

const sessionOrder = ref<number[]>([]);

watch(isOpen, (open) => {
  if (open) {
    const selectedIds = new Set(selectedCategoryIds.value);
    const selectedFirst = baseSortedCategories.value.filter((c) => selectedIds.has(c.id));
    const others = baseSortedCategories.value.filter((c) => !selectedIds.has(c.id));
    sessionOrder.value = [...selectedFirst, ...others].map((c) => c.id);
  }
});

const orderedCategories = computed(() => {
  if (isOpen.value && sessionOrder.value.length) {
    const byId = new Map(baseSortedCategories.value.map((c) => [c.id, c] as const));
    return sessionOrder.value.map((id) => byId.get(id)!).filter(Boolean);
  }
  return baseSortedCategories.value;
});

const displayedCategories = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return orderedCategories.value;
  return orderedCategories.value.filter((c) => c.name.toLowerCase().includes(term));
});

const isCategorySelected = (categoryId: number) => selectedCategoryIds.value.includes(categoryId);

const pickCategory = (category: CategoryModel) => {
  const isSelected = isCategorySelected(category.id);
  toggleCategory({ category, checked: !isSelected });
};

const toggleCategory = ({ category, checked }: { category: CategoryModel; checked: boolean }) => {
  if (checked) {
    selectedCategoryIds.value = [...selectedCategoryIds.value, category.id];
  } else {
    selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => id !== category.id);
  }

  emit('update:categoryIds', selectedCategoryIds.value);
};

const clearSelection = () => {
  selectedCategoryIds.value = [];
  emit('update:categoryIds', []);
};
</script>
