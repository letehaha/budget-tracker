<template>
  <template v-if="category">
    <div
      :class="cn('flex shrink-0 items-center justify-center rounded-full', effectiveIcon ? 'size-6' : 'size-5')"
      :style="{
        backgroundColor: effectiveIcon ? `${category.color}2d` : category.color,
        color: category.color,
      }"
    >
      <TagIcon v-if="effectiveIcon" :name="effectiveIcon" class="size-4" />
    </div>
  </template>
</template>

<script setup lang="ts">
import TagIcon from '@/components/common/icons/tag-icon.vue';
import { cn } from '@/lib/utils';
import { useCategoriesStore } from '@/stores';
import { CategoryModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

const props = defineProps<{
  category?: CategoryModel;
  categoryId?: number;
}>();

const { categoriesMap } = storeToRefs(useCategoriesStore());

const category = computed(() => {
  if (props.category) return props.category;
  if (props.categoryId) return categoriesMap.value[props.categoryId];
  return null;
});

// Subcategories inherit parent's icon (traverses up the tree)
const effectiveIcon = computed(() => {
  if (!category.value) return null;

  let current: CategoryModel | undefined = category.value;

  while (current) {
    if (current.icon) return current.icon;
    if (!current.parentId) break;
    current = categoriesMap.value[current.parentId];
  }

  return null;
});
</script>
